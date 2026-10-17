
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import "./VideoCall.css";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
];

function friendlyError(error) {
  const message = error?.message || "Could not start the video call.";

  if (/permission|denied|NotAllowedError/i.test(message)) {
    return "Camera/microphone permission denied. Allow access in your browser settings and try again.";
  }

  if (/video_calls|video_call_signals|schema cache|does not exist/i.test(message)) {
    return "Video call database setup is missing or inaccessible. Check your Supabase tables, policies and Realtime settings.";
  }

  return message;
}

export default function VideoCall({
  user,
  role,
  listing,
  partnerName = "FoodRescue participant",
}) {
  const [call, setCall] = useState(null);
  const [incoming, setIncoming] = useState(null);
  const [callState, setCallState] = useState("idle");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const activeCallRef = useRef(null);
  const signalChannelRef = useRef(null);
  const inboxChannelRef = useRef(null);
  const seenSignalsRef = useRef(new Set());
  const pendingCandidatesRef = useRef([]);
  const mountedRef = useRef(false);

  const normalizedRole = String(role || "").toLowerCase();
  const isDonor = normalizedRole === "donor";
  const isVolunteer = normalizedRole === "volunteer";

  const hasAssignment = Boolean(
    user?.id &&
      listing?.id &&
      listing?.donor_id &&
      listing?.claimed_by &&
      listing.donor_id !== listing.claimed_by &&
      ["claimed", "picked_up"].includes(listing.status)
  );

  const partnerId = isDonor
    ? listing?.claimed_by
    : isVolunteer
      ? listing?.donor_id
      : null;

  const isParticipant = Boolean(
    (isDonor && listing?.donor_id === user?.id) ||
      (isVolunteer && listing?.claimed_by === user?.id)
  );

  const eligible = Boolean(
    hasAssignment &&
      partnerId &&
      partnerId !== user?.id &&
      isParticipant
  );

  let debugMessage = "";

  if (!user?.id) {
    debugMessage = "Please sign in to use video calling.";
  } else if (!isDonor && !isVolunteer) {
    debugMessage = "Video calling is available to donors and assigned volunteers.";
  } else if (!listing?.donor_id || !listing?.claimed_by) {
    debugMessage = "A volunteer must accept this donation before video calling is available.";
  } else if (listing.donor_id === listing.claimed_by) {
    debugMessage = "The donor and volunteer assignments need to be different.";
  } else if (!["claimed", "picked_up"].includes(listing.status)) {
    debugMessage = "Video calling is available after the donation is accepted.";
  } else if (!isParticipant) {
    debugMessage = "This account is not the donor or assigned volunteer for this donation.";
  }

  const cleanupMedia = useCallback(async () => {
    if (signalChannelRef.current) {
      const channel = signalChannelRef.current;
      signalChannelRef.current = null;
      await supabase.removeChannel(channel);
    }

    if (pcRef.current) {
      const pc = pcRef.current;
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
      pcRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;

    pendingCandidatesRef.current = [];
    seenSignalsRef.current.clear();
  }, []);

  const closeCall = useCallback(async (updateServer = true) => {
    const active = activeCallRef.current;

    // Clear the active call immediately to avoid duplicate hang-up requests.
    activeCallRef.current = null;

    if (updateServer && active?.id) {
      const { error: updateError } = await supabase
        .from("video_calls")
        .update({
          status: "ended",
          ended_at: new Date().toISOString(),
        })
        .eq("id", active.id)
        .in("status", ["ringing", "accepted"]);

      if (updateError) {
        console.warn("Could not update call status:", updateError.message);
      }
    }

    await cleanupMedia();

    if (mountedRef.current) {
      setCall(null);
      setIncoming(null);
      setCallState("idle");
      setMuted(false);
      setCameraOff(false);
      setError("");
    }
  }, [cleanupMedia]);

  const getMediaAndPeer = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Camera access requires HTTPS or localhost and a supported browser."
      );
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });

    localStreamRef.current = stream;

    if (localVideo.current) {
      localVideo.current.srcObject = stream;
      localVideo.current.muted = true;
      await localVideo.current.play().catch(() => {});
    }

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
    });

    pcRef.current = pc;

    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    pc.ontrack = (event) => {
      const streamFromPeer = event.streams?.[0];

      if (remoteVideo.current && streamFromPeer) {
        remoteVideo.current.srcObject = streamFromPeer;
        remoteVideo.current.play().catch(() => {});
      }
    };

    pc.onicecandidate = async (event) => {
      const active = activeCallRef.current;

      if (!event.candidate || !active?.id) return;

      const { error: insertError } = await supabase
        .from("video_call_signals")
        .insert({
          call_id: active.id,
          sender_id: user.id,
          signal_type: "candidate",
          payload: event.candidate.toJSON(),
        });

      if (insertError) {
        console.warn("Could not send ICE candidate:", insertError.message);
      }
    };

    pc.onconnectionstatechange = () => {
      if (!mountedRef.current) return;

      if (pc.connectionState === "connected") {
        setCallState("connected");
      } else if (
        ["failed", "disconnected"].includes(pc.connectionState)
      ) {
        setCallState("reconnecting");
      }
    };

    return pc;
  }, [user?.id]);

  const applySignal = useCallback(async (signal) => {
    const pc = pcRef.current;

    if (!pc || !signal?.id || seenSignalsRef.current.has(signal.id)) {
      return;
    }

    seenSignalsRef.current.add(signal.id);

    try {
      if (
        signal.signal_type === "offer" &&
        signal.sender_id !== user.id &&
        !pc.remoteDescription
      ) {
        await pc.setRemoteDescription(
          new RTCSessionDescription(signal.payload)
        );

        for (const candidate of pendingCandidatesRef.current) {
          await pc.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        }

        pendingCandidatesRef.current = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        const { error: answerError } = await supabase
          .from("video_call_signals")
          .insert({
            call_id: signal.call_id,
            sender_id: user.id,
            signal_type: "answer",
            payload: answer,
          });

        if (answerError) throw answerError;
      } else if (
        signal.signal_type === "answer" &&
        signal.sender_id !== user.id &&
        !pc.remoteDescription
      ) {
        await pc.setRemoteDescription(
          new RTCSessionDescription(signal.payload)
        );

        for (const candidate of pendingCandidatesRef.current) {
          await pc.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        }

        pendingCandidatesRef.current = [];
      } else if (
        signal.signal_type === "candidate" &&
        signal.sender_id !== user.id
      ) {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(
            new RTCIceCandidate(signal.payload)
          );
        } else {
          pendingCandidatesRef.current.push(signal.payload);
        }
      }
    } catch (e) {
      console.error("Video call signaling error:", e);

      if (mountedRef.current) {
        setError(friendlyError(e));
      }
    }
  }, [user?.id]);

  const subscribeToSignals = useCallback(async (callId) => {
    if (signalChannelRef.current) {
      const previous = signalChannelRef.current;
      signalChannelRef.current = null;
      await supabase.removeChannel(previous);
    }

    const channel = supabase
      .channel(`video-call-signals-${callId}-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "video_call_signals",
          filter: `call_id=eq.${callId}`,
        },
        ({ new: signal }) => {
          void applySignal(signal);
        }
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;

        void (async () => {
          const { data, error: readError } = await supabase
            .from("video_call_signals")
            .select("id,call_id,sender_id,signal_type,payload,created_at")
            .eq("call_id", callId)
            .order("created_at", { ascending: true });

          if (readError) {
            if (mountedRef.current) {
              setError(friendlyError(readError));
            }
            return;
          }

          for (const signal of data || []) {
            await applySignal(signal);
          }
        })();
      });

    signalChannelRef.current = channel;
  }, [applySignal, user?.id]);

  const startCall = async () => {
    if (!eligible || callState !== "idle") return;

    setError("");
    setCallState("starting");

    try {
      const { data: created, error: createError } = await supabase
        .from("video_calls")
        .insert({
          listing_id: listing.id,
          donor_id: listing.donor_id,
          volunteer_id: listing.claimed_by,
          initiated_by: user.id,
          status: "ringing",
        })
        .select(
          "id,listing_id,donor_id,volunteer_id,initiated_by,status"
        )
        .single();

      if (createError) throw createError;

      activeCallRef.current = created;
      setCall(created);

      await getMediaAndPeer();
      await subscribeToSignals(created.id);

      const pc = pcRef.current;
      const offer = await pc.createOffer();

      await pc.setLocalDescription(offer);

      const { error: offerError } = await supabase
        .from("video_call_signals")
        .insert({
          call_id: created.id,
          sender_id: user.id,
          signal_type: "offer",
          payload: offer,
        });

      if (offerError) throw offerError;

      if (mountedRef.current) setCallState("ringing");
    } catch (e) {
      console.error("Could not start FoodRescue video call:", e);

      if (mountedRef.current) setError(friendlyError(e));

      await closeCall(true);
    }
  };

  const acceptCall = async (incomingCall) => {
    if (!incomingCall?.id) return;

    setError("");
    setCallState("starting");

    try {
      const { data: updated, error: updateError } = await supabase
        .from("video_calls")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
        })
        .eq("id", incomingCall.id)
        .eq("status", "ringing")
        .select(
          "id,listing_id,donor_id,volunteer_id,initiated_by,status"
        )
        .single();

      if (updateError) throw updateError;

      activeCallRef.current = updated;
      setCall(updated);
      setIncoming(null);

      await getMediaAndPeer();
      await subscribeToSignals(updated.id);

      if (mountedRef.current) setCallState("connecting");
    } catch (e) {
      console.error("Could not accept FoodRescue video call:", e);

      if (mountedRef.current) setError(friendlyError(e));

      await closeCall(false);
    }
  };

  const rejectCall = async (incomingCall) => {
    const { error: rejectError } = await supabase
      .from("video_calls")
      .update({
        status: "rejected",
        ended_at: new Date().toISOString(),
      })
      .eq("id", incomingCall.id)
      .eq("status", "ringing");

    if (rejectError) {
      setError(friendlyError(rejectError));
    }

    setIncoming(null);
  };

  useEffect(() => {
    mountedRef.current = true;

    if (
      !user?.id ||
      !listing?.id ||
      (!isDonor && !isVolunteer) ||
      !listing?.donor_id ||
      !listing?.claimed_by
    ) {
      return undefined;
    }

    const channel = supabase
      .channel(`video-calls-inbox-${user.id}-${listing.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "video_calls",
          filter: `listing_id=eq.${listing.id}`,
        },
        ({ new: row }) => {
          if (
            !row ||
            ![row.donor_id, row.volunteer_id].includes(user.id)
          ) {
            return;
          }

          if (
            row.initiated_by !== user.id &&
            row.status === "ringing"
          ) {
            setIncoming((current) => current || row);
          }

          if (
            row.id === activeCallRef.current?.id &&
            ["ended", "rejected"].includes(row.status)
          ) {
            void closeCall(false);
          }

          if (
            row.id === incoming?.id &&
            ["ended", "rejected"].includes(row.status)
          ) {
            setIncoming(null);
          }
        }
      )
      .subscribe();

    inboxChannelRef.current = channel;

    return () => {
      mountedRef.current = false;

      if (inboxChannelRef.current) {
        const inbox = inboxChannelRef.current;
        inboxChannelRef.current = null;
        void supabase.removeChannel(inbox);
      }

      void closeCall(false);
    };
  }, [
    user?.id,
    listing?.id,
    listing?.donor_id,
    listing?.claimed_by,
    isDonor,
    isVolunteer,
    closeCall,
  ]);

  const toggleMute = () => {
    const next = !muted;

    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });

    setMuted(next);
  };

  const toggleCamera = () => {
    const next = !cameraOff;

    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !next;
    });

    setCameraOff(next);
  };

  return (
    <>
      {eligible ? (
        <button
          type="button"
          className="fr-video-call-button"
          onClick={startCall}
          disabled={callState !== "idle"}
        >
          {callState === "idle"
            ? "📹 Video call"
            : callState === "ringing"
              ? "Calling…"
              : callState === "connected"
                ? "Video call connected"
                : "Video call active"}
        </button>
      ) : (
        <span className="fr-video-call-hint" role="status">
          {debugMessage || "Video call is not available for this listing."}
        </span>
      )}

      {error && !call && (
        <div className="fr-video-error" role="alert">
          {error}
        </div>
      )}

      {incoming && !call && (
        <div
          className="fr-call-toast"
          role="dialog"
          aria-label="Incoming video call"
        >
          <div>
            <strong>Incoming FoodRescue video call</strong>
            <p>
              {partnerName} is calling about{" "}
              {listing?.title || "this donation"}.
            </p>
          </div>

          <div className="fr-call-toast-actions">
            <button
              type="button"
              onClick={() => acceptCall(incoming)}
            >
              Accept
            </button>

            <button
              type="button"
              className="secondary"
              onClick={() => rejectCall(incoming)}
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {(call || callState === "starting") && (
        <div
          className="fr-video-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="FoodRescue video call"
        >
          <div className="fr-video-window">
            <div className="fr-video-header">
              <div>
                <strong>FoodRescue video call</strong>
                <span>
                  {callState === "ringing"
                    ? "Ringing…"
                    : callState === "connected"
                      ? "Connected"
                      : callState === "reconnecting"
                        ? "Connection interrupted"
                        : "Connecting…"}
                </span>
              </div>

              <button
                type="button"
                className="fr-close"
                onClick={() => closeCall(true)}
                aria-label="Close call"
              >
                ×
              </button>
            </div>

            {error && (
              <div className="fr-video-error" role="alert">
                {error}
              </div>
            )}

            <div className="fr-video-grid">
              <div className="fr-video-tile">
                <video
                  ref={remoteVideo}
                  autoPlay
                  playsInline
                />
                <span>{partnerName}</span>
                <div className="fr-video-placeholder">
                  Waiting for the other participant…
                </div>
              </div>

              <div className="fr-video-tile fr-local-tile">
                <video
                  ref={localVideo}
                  autoPlay
                  playsInline
                  muted
                />
                <span>
                  You{muted ? " · Muted" : ""}
                  {cameraOff ? " · Camera off" : ""}
                </span>
              </div>
            </div>

            <div className="fr-video-controls">
              <button type="button" onClick={toggleMute}>
                {muted ? "Unmute mic" : "Mute mic"}
              </button>

              <button type="button" onClick={toggleCamera}>
                {cameraOff ? "Turn camera on" : "Turn camera off"}
              </button>

              <button
                type="button"
                className="hangup"
                onClick={() => closeCall(true)}
              >
                End call
              </button>
            </div>

            <p className="fr-video-privacy">
              Camera and microphone access starts when you call or accept
              a call. Avoid sharing private information on camera.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
