import { AbsoluteFill } from "remotion";

// Instagram/TikTok safe zone wrapper
// Top 150px: platform UI (notifications, back button)
// Bottom 250px: platform UI (caption, buttons, profile)
// Sides 40px: avoid edge clipping

interface SafeZoneProps {
  children: React.ReactNode;
  showGuides?: boolean; // set true during development to visualize safe zone
}

export const SafeZone: React.FC<SafeZoneProps> = ({ children, showGuides = false }) => {
  return (
    <AbsoluteFill
      style={{
        top: 150,
        bottom: 250,
        left: 40,
        right: 40,
        position: "absolute",
        overflow: "hidden",
      }}
    >
      {showGuides && (
        <AbsoluteFill
          style={{
            border: "2px dashed rgba(255, 0, 0, 0.5)",
            pointerEvents: "none",
          }}
        />
      )}
      {children}
    </AbsoluteFill>
  );
};

// Full frame (for background images — these CAN bleed into UI areas)
export const FullFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill>{children}</AbsoluteFill>
);
