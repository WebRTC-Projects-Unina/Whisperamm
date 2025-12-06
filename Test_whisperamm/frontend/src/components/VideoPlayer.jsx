import React, { useRef, useEffect } from 'react';

const VideoPlayer = ({ stream, isLocal, display, audioOnly = false }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      // Tentativo di autoplay
      videoRef.current.play().catch(e => {
          // Fallback muto se necessario (raro in audioOnly se c'è interazione utente)
          console.warn("Autoplay audio fallito", e);
      });
    }
  }, [stream]);

  // --- MODALITÀ "SOLO AUDIO" (INVISIBILE) ---
  if (audioOnly) {
    return (
      <div style={{ width: 0, height: 0, overflow: 'hidden', opacity: 0 }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal} // Importante: muto se sei tu
        />
      </div>
    );
  }

  // --- MODALITÀ STANDARD (VIDEO VISIBILE) ---
  return (
    <div style={styles.videoContainer}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={styles.video}
      />
      <div style={styles.label}>
        {display || (isLocal ? "Tu" : "Utente")}
      </div>
    </div>
  );
};

const styles = {
  videoContainer: {
    position: 'relative',
    width: '100%',     // Si adatta al contenitore padre
    height: '100%',
    backgroundColor: '#000',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: 'scaleX(-1)' 
  },
  label: {
    position: 'absolute',
    bottom: '5px',
    left: '5px',
    color: 'white',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
  }
};

export default VideoPlayer;