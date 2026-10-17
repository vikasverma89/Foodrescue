
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import LiveActivityFeed from "./LiveActivityFeed";
import VideoCall from "./VideoCall";

const STATUS_LABELS = {
  available: "Available",
  claimed: "Claimed",
  picked_up: "Picked Up",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function formatDate(value) {
  if (!value) return "Not set";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Not set";

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function errorMessage(error) {
  const message = error?.message || "Something went wrong.";

  if (/function .*claim_food_listing.* does not exist/i.test(message)) {
    return "The claim_food_listing database function was not found. Check the function name in Supabase.";
  }

  if (/function .*update_food_listing_status.* does not exist/i.test(message)) {
    return "The update_food_listing_status database function was not found. Check the function name in Supabase.";
  }

  return message;
}

export default function Dashboard({ user, role }) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState("available");

  const normalizedRole = String(role || "").toLowerCase();
  const isVolunteer = normalizedRole === "volunteer";
  const isDonor = normalizedRole === "donor";
  const isNgo = normalizedRole === "ngo";

  const loadListings = useCallback(async (showLoader = true) => {
    if (!user?.id) {
      setListings([]);
      setLoading(false);
      return;
    }

    if (showLoader) setLoading(true);
    setError("");

    try {
      let query = supabase
        .from("food_listings")
        .select(
          "id,title,description,quantity,food_type,pickup_address,pickup_deadline,status,donor_id,claimed_by,picked_up_at,delivered_at,created_at"
        )
        .order("pickup_deadline", { ascending: true });

      if (isDonor) {
        query = query.eq("donor_id", user.id);
      } else if (isVolunteer) {
        if (view === "tasks") {
          query = query.eq("claimed_by", user.id);
        } else {
          query = query.eq("status", "available");
        }
      } else if (isNgo) {
        query = query.in("status", [
          "available",
          "claimed",
          "picked_up",
          "delivered",
        ]);
      } else {
        setListings([]);
        setLoading(false);
        setError(
          "Your account role is not recognized. Please sign in again or contact the administrator."
        );
        return;
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      const rows = data || [];

      const profileIds = [
        ...new Set(
          rows
            .flatMap((item) => [item.donor_id, item.claimed_by])
            .filter(Boolean)
        ),
      ];

      let profileMap = {};

      if (profileIds.length) {
        const { data: profiles, error: profileError } = await supabase
          .from("profiles")
          .select("id,full_name,phone,organization_name")
          .in("id", profileIds);

        if (!profileError) {
          profileMap = Object.fromEntries(
            (profiles || []).map((profile) => [profile.id, profile])
          );
        }
      }

      setListings(
        rows.map((item) => ({
          ...item,
          donor: profileMap[item.donor_id] || null,
          volunteer: profileMap[item.claimed_by] || null,
        }))
      );
    } catch (e) {
      console.error("FoodRescue dashboard action failed:", e);
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [user?.id, isDonor, isVolunteer, isNgo, view]);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  useEffect(() => {
    const channel = supabase
      .channel(`food-listings-${user?.id || "anonymous"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "food_listings",
        },
        () => {
          void loadListings(false);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, loadListings]);

  const runAction = async (listing, action) => {
    if (!user?.id) {
      setError("Please sign in again before updating a donation.");
      return;
    }

    setBusyId(listing.id);
    setError("");
    setNotice("");

    try {
      if (action === "claim") {
        const { data: claimData, error: rpcError } = await supabase.rpc(
          "claim_food_listing",
          { p_listing_id: listing.id }
        );

        if (rpcError) throw rpcError;

        let claimedRow = Array.isArray(claimData)
          ? claimData[0]
          : claimData;

        if (
          !claimedRow ||
          claimedRow.status !== "claimed" ||
          claimedRow.claimed_by !== user.id
        ) {
          const { data: verifiedListing, error: verifyError } =
            await supabase
              .from("food_listings")
              .select("id,status,claimed_by")
              .eq("id", listing.id)
              .maybeSingle();

          if (verifyError) throw verifyError;

          claimedRow = verifiedListing;
        }

        if (
          !claimedRow ||
          claimedRow.status !== "claimed" ||
          claimedRow.claimed_by !== user.id
        ) {
          throw new Error(
            "The claim was not confirmed. Check the listing status and your volunteer role in Supabase, then try again."
          );
        }

        setNotice("Pickup accepted! The donation is now in My Tasks.");
        setView("tasks");
      } else {
        const nextStatus =
          action === "picked_up" ? "picked_up" : "delivered";

        const { error: updateError } = await supabase.rpc(
          "update_food_listing_status",
          {
            p_listing_id: listing.id,
            p_new_status: nextStatus,
          }
        );

        if (updateError) throw updateError;

        const { data: verifiedListing, error: verifyError } =
          await supabase
            .from("food_listings")
            .select("id,status,claimed_by")
            .eq("id", listing.id)
            .maybeSingle();

        if (verifyError) throw verifyError;

        if (
          !verifiedListing ||
          verifiedListing.status !== nextStatus ||
          verifiedListing.claimed_by !== user.id
        ) {
          throw new Error(
            `Supabase did not confirm the status change to "${nextStatus}". Please refresh and try again.`
          );
        }

        setNotice(
          nextStatus === "picked_up"
            ? "Marked as picked up."
            : "Delivery marked complete. Thank you!"
        );
      }

      await loadListings(false);
    } catch (e) {
      console.error("FoodRescue dashboard action failed:", e);
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const displayedListings = useMemo(() => listings, [listings]);

  if (!user) {
    return (
      <section className="dashboard-section">
        <p>Please log in to view your dashboard.</p>
      </section>
    );
  }

  return (
    <section id="dashboard" className="dashboard-section">
      <div className="dashboard-container">
        <div className="dashboard-heading">
          <p className="dashboard-eyebrow">FOODRESCUE DASHBOARD</p>

          <h2>
            {isVolunteer
              ? "Volunteer Dashboard"
              : isDonor
                ? "Donor Dashboard"
                : "NGO Dashboard"}
          </h2>

          <p>
            {isVolunteer
              ? "Available donations accept karein, pickup coordinate karein aur delivery status update karein."
              : isDonor
                ? "Apni food listings aur unka current status track karein."
                : "Community ki available donations aur unki progress dekhein."}
          </p>

          <p className="dashboard-user">
            Logged in as:{" "}
            <strong>{user.email || "Signed-in user"}</strong>
          </p>
        </div>

        {isVolunteer && (
          <div
            className="dashboard-tabs"
            role="tablist"
            aria-label="Volunteer listing views"
          >
            <button
              type="button"
              className={view === "available" ? "active" : ""}
              onClick={() => setView("available")}
            >
              Available Food
            </button>

            <button
              type="button"
              className={view === "tasks" ? "active" : ""}
              onClick={() => setView("tasks")}
            >
              My Tasks
            </button>
          </div>
        )}

        {notice && (
          <div className="dashboard-notice" role="status">
            {notice}
          </div>
        )}

        {error && (
          <div className="dashboard-error" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="dashboard-state">Loading food listings…</div>
        ) : displayedListings.length === 0 ? (
          <div className="dashboard-empty">
            <div className="dashboard-empty-icon">
              {isVolunteer && view === "tasks" ? "📋" : "🍲"}
            </div>

            <h3>
              {isVolunteer && view === "tasks"
                ? "No tasks yet"
                : "No food listings found"}
            </h3>

            <p>
              {isVolunteer && view === "tasks"
                ? "Accept an available donation and it will appear here."
                : isDonor
                  ? "Your submitted food donations will appear here."
                  : "New available donations will appear here when donors post them."}
            </p>
          </div>
        ) : (
          <div className="dashboard-listings">
            {displayedListings.map((listing) => {
              const isMine = listing.claimed_by === user.id;

              console.log("VIDEO CALL DEBUG:", {
  userId: user.id,
  role: normalizedRole,
  listingId: listing.id,
  status: listing.status,
  claimedBy: listing.claimed_by,
  isMine: listing.claimed_by === user.id,
});

              const canClaim =
                isVolunteer &&
                view === "available" &&
                listing.status === "available";

              const canAdvance =
                isVolunteer &&
                isMine &&
                ["claimed", "picked_up"].includes(listing.status);

              return (
                <article
                  className="dashboard-listing-card"
                  key={listing.id}
                >
                  <div className="dashboard-card-top">
                    <span className="dashboard-food-type">
                      {listing.food_type || "Food donation"}
                    </span>

                    <span
                      className={`dashboard-status status-${listing.status || "available"}`}
                    >
                      {STATUS_LABELS[listing.status] ||
                        listing.status ||
                        "Unknown"}
                    </span>
                  </div>

                  <h3>{listing.title || "Food donation"}</h3>

                  <p>
                    {listing.description ||
                      "No additional details provided."}
                  </p>

                  <div className="dashboard-details">
                    <p>
                      <strong>Quantity:</strong>{" "}
                      {listing.quantity || "Not specified"}
                    </p>

                    <p>
                      <strong>Pickup Address:</strong>{" "}
                      {listing.pickup_address ||
                        "Contact donor for details"}
                    </p>

                    <p>
                      <strong>Pickup Deadline:</strong>{" "}
                      {formatDate(listing.pickup_deadline)}
                    </p>

                    {listing.donor && (
                      <div className="dashboard-donor">
                        <p>
                          <strong>Donor:</strong>{" "}
                          {listing.donor.full_name ||
                            listing.donor.organization_name ||
                            "Food donor"}
                        </p>

                        {listing.donor.phone ? (
                          <p>
                            <strong>Contact:</strong>{" "}
                            <a href={`tel:${listing.donor.phone}`}>
                              {listing.donor.phone}
                            </a>
                          </p>
                        ) : (
                          <p>
                            <strong>Contact:</strong>{" "}
                            Donor phone number is not available.
                          </p>
                        )}
                      </div>
                    )}

                    {listing.picked_up_at && (
                      <p>
                        <strong>Picked up:</strong>{" "}
                        {formatDate(listing.picked_up_at)}
                      </p>
                    )}

                    {listing.delivered_at && (
                      <p>
                        <strong>Delivered:</strong>{" "}
                        {formatDate(listing.delivered_at)}
                      </p>
                    )}
                  </div>

                  <div className="dashboard-card-actions">
                    {(isDonor || (isVolunteer && isMine)) && (
                      <VideoCall
                        user={user}
                        role={normalizedRole}
                        listing={listing}
                        partnerName={
                          isDonor
                            ? listing.volunteer?.full_name ||
                              "Assigned volunteer"
                            : listing.donor?.full_name ||
                              listing.donor?.organization_name ||
                              "Food donor"
                        }
                      />
                    )}

                    {canClaim && (
                      <button
                        type="button"
                        disabled={busyId === listing.id}
                        onClick={() => runAction(listing, "claim")}
                      >
                        {busyId === listing.id
                          ? "Accepting…"
                          : "Accept Pickup"}
                      </button>
                    )}

                    {canAdvance && listing.status === "claimed" && (
                      <button
                        type="button"
                        disabled={busyId === listing.id}
                        onClick={() => runAction(listing, "picked_up")}
                      >
                        {busyId === listing.id
                          ? "Updating…"
                          : "Mark as Picked Up"}
                      </button>
                    )}

                    {canAdvance && listing.status === "picked_up" && (
                      <button
                        type="button"
                        disabled={busyId === listing.id}
                        onClick={() => runAction(listing, "delivered")}
                      >
                        {busyId === listing.id
                          ? "Updating…"
                          : "Mark as Delivered"}
                      </button>
                    )}

                    {isVolunteer &&
                      view === "tasks" &&
                      isMine &&
                      listing.status === "delivered" && (
                        <span className="dashboard-complete">
                          ✓ Task completed
                        </span>
                      )}

                    {isDonor && (
                      <span className="dashboard-muted">
                        Your donation status is updated in real time.
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <LiveActivityFeed user={user} role={normalizedRole} />
      </div>
    </section>
  );
}
