import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

interface TextOverlayProps {
  text: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold" | "900" | number;
  color?: string;
  top?: string | number;
  bottom?: string | number;
  left?: string | number;
  right?: string | number;
  align?: "left" | "center" | "right";
  animation?: "fade-in" | "slide-up" | "scale-in" | "none";
  delay?: number; // frames to wait before appearing
  backgroundColor?: string;
  padding?: number;
  maxWidth?: string;
  /** Font family — usar las que carga @remotion/google-fonts en la composición.
   *  Si no se pasa, usa stack genérico Inter/Helvetica. */
  fontFamily?: string;
  /** Letter spacing custom (default -0.02em). */
  letterSpacing?: string;
}

export const TextOverlay: React.FC<TextOverlayProps> = ({
  text,
  fontSize = 48,
  fontWeight = "bold",
  color = "#FFFFFF",
  top,
  bottom,
  left,
  right,
  align = "center",
  animation = "fade-in",
  delay = 0,
  backgroundColor,
  padding = 0,
  maxWidth = "85%",
  fontFamily,
  letterSpacing = "-0.02em",
}) => {
  const frame = useCurrentFrame();
  const adjustedFrame = Math.max(0, frame - delay);

  let opacity = 1;
  let translateY = 0;
  let scale = 1;

  if (animation === "fade-in") {
    opacity = interpolate(adjustedFrame, [0, 12], [0, 1], {
      extrapolateRight: "clamp",
    });
  } else if (animation === "slide-up") {
    opacity = interpolate(adjustedFrame, [0, 10], [0, 1], {
      extrapolateRight: "clamp",
    });
    translateY = interpolate(adjustedFrame, [0, 15], [30, 0], {
      extrapolateRight: "clamp",
    });
  } else if (animation === "scale-in") {
    opacity = interpolate(adjustedFrame, [0, 8], [0, 1], {
      extrapolateRight: "clamp",
    });
    scale = interpolate(adjustedFrame, [0, 10], [0.8, 1], {
      extrapolateRight: "clamp",
    });
  }

  const positionStyle: React.CSSProperties = {};
  if (top !== undefined) positionStyle.top = top;
  if (bottom !== undefined) positionStyle.bottom = bottom;
  if (left !== undefined) positionStyle.left = left;
  if (right !== undefined) positionStyle.right = right;
  if (!top && !bottom) positionStyle.top = "50%";
  if (!left && !right) positionStyle.left = "50%";

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          ...positionStyle,
          transform: `translate(${left === undefined && right === undefined ? "-50%" : "0"}, ${top === undefined && bottom === undefined ? "-50%" : "0"}) translateY(${translateY}px) scale(${scale})`,
          opacity,
          textAlign: align,
          maxWidth,
          width: "100%",
          marginLeft: left === undefined && right === undefined ? "auto" : undefined,
          marginRight: left === undefined && right === undefined ? "auto" : undefined,
        }}
      >
        <span
          style={{
            fontFamily:
              fontFamily ||
              "'Inter', 'Helvetica Neue', Arial, sans-serif",
            fontSize,
            fontWeight,
            color,
            lineHeight: 1.2,
            letterSpacing,
            backgroundColor: backgroundColor || "transparent",
            padding: backgroundColor ? `${padding}px ${padding * 1.5}px` : 0,
            borderRadius: backgroundColor ? 8 : 0,
            display: "inline-block",
            textShadow: !backgroundColor
              ? "0 2px 12px rgba(0,0,0,0.6)"
              : "none",
          }}
        >
          {text}
        </span>
      </div>
    </AbsoluteFill>
  );
};
