import { useEffect, useState } from "react";
import { supabase } from "./supabase";

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function LiveActivityFeed({ user, role }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadEvents() {
      const { data, error } = await supabase
        .from("foodrescue_activity")
        .select("id,listing_id,actor_id,event_type,message,created_at")
        .order("created_at", { ascending: false })
        .limit(25);
      if (!alive) return;
      if (error) {
        setFeedError(error.message);
      } else {
        setEvents(data || []);
        setFeedError("");
      }
      setLoading(false);
    }

    loadEvents();

    const channel = supabase
      .channel("foodrescue-live-activity")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "foodrescue_activity" }, (payload) => {
        if (!alive) return;
        setEvents((current) => [payload.new, ...current.filter((event) => event.id !== payload.new.id)].slice(0, 25));
      })
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return (
    <section className="live-activity" aria-label="Live FoodRescue activity">
      <div className="live-activity-heading">
        <div>
          <p className="dashboard-eyebrow">COMMUNITY UPDATES</p>
          <h3><span className="live-dot" /> Live Activity Feed</h3>
        </div>
        <span className="live-activity-badge">REAL TIME</span>
      </div>
      <p className="live-activity-intro">Food donations aur pickup/delivery progress ke updates yahan live dikhte hain.</p>
      {loading ? (
        <p className="live-activity-empty">Loading activity…</p>
      ) : feedError ? (
        <p className="live-activity-empty">Activity feed load nahi hua. Supabase SQL setup aur table permissions check karein.</p>
      ) : events.length === 0 ? (
        <p className="live-activity-empty">Abhi koi activity nahi hai. New donations aur status updates yahan dikhengi.</p>
      ) : (
        <ul className="live-activity-list">
          {events.map((event) => (
            <li key={event.id} className="live-activity-item">
              <span className="live-activity-icon">
                {event.event_type === "delivered" ? "💚" : event.event_type === "picked_up" ? "🚚" : event.event_type === "accepted" ? "🤝" : "🍲"}
              </span>
              <div className="live-activity-content">
                <p>{event.message}</p>
                <time dateTime={event.created_at}>{formatTime(event.created_at)}</time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
