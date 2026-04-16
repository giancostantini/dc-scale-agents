import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

// Wrap a scene with this to add an entrance/exit transition
interface TransitionProps {
  type: "fade" | "hard-cut" | "wipe-up" | "flash";
  durationInFrames: number; // total duration of the transition
  children: React.ReactNode;
}

export const FadeTransition: React.FC<{ children: React.ReactNode; durationInFrames?: number }> = ({
  children,
  durationInFrames = 8,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity }}>
      {children}
    </AbsoluteFill>
  );
};

export const FlashTransition: React.FC<{ children: React.ReactNode; durationInFrames?: number }> = ({
  children,
  durationInFrames = 4,
}) => {
  const frame = useCurrentFrame();
  const brightness = interpolate(
    frame,
    [0, Math.floor(durationInFrames / 2), durationInFrames],
    [3, 1.5, 1],
    { extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ filter: `brightness(${brightness})` }}>
      {children}
    </AbsoluteFill>
  );
};
