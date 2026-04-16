import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";

interface ImageSceneProps {
  src: string;
  objectFit?: "cover" | "contain" | "fill";
  animation?: "zoom-in" | "zoom-out" | "pan-right" | "pan-left" | "none";
  overlayColor?: string;
  overlayOpacity?: number;
  brightness?: number; // 0-2, default 1
}

export const ImageScene: React.FC<ImageSceneProps> = ({
  src,
  objectFit = "cover",
  animation = "zoom-in",
  overlayColor = "#000000",
  overlayOpacity = 0,
  brightness = 1,
}) => {
  const frame = useCurrentFrame();

  let scaleValue = 1;
  let translateX = 0;

  if (animation === "zoom-in") {
    scaleValue = interpolate(frame, [0, 90], [1, 1.08], {
      extrapolateRight: "clamp",
    });
  } else if (animation === "zoom-out") {
    scaleValue = interpolate(frame, [0, 90], [1.08, 1], {
      extrapolateRight: "clamp",
    });
  } else if (animation === "pan-right") {
    translateX = interpolate(frame, [0, 90], [-30, 0], {
      extrapolateRight: "clamp",
    });
  } else if (animation === "pan-left") {
    translateX = interpolate(frame, [0, 90], [30, 0], {
      extrapolateRight: "clamp",
    });
  }

  return (
    <AbsoluteFill>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit,
          transform: `scale(${scaleValue}) translateX(${translateX}px)`,
          filter: `brightness(${brightness})`,
          transformOrigin: "center center",
        }}
      />
      {overlayOpacity > 0 && (
        <AbsoluteFill
          style={{
            backgroundColor: overlayColor,
            opacity: overlayOpacity,
          }}
        />
      )}
    </AbsoluteFill>
  );
};
