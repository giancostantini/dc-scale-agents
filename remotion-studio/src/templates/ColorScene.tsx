import { AbsoluteFill } from "remotion";

interface ColorSceneProps {
  color?: string;
  gradient?: {
    from: string;
    to: string;
    direction?: "to bottom" | "to right" | "to bottom right" | "135deg";
  };
  children?: React.ReactNode;
}

export const ColorScene: React.FC<ColorSceneProps> = ({
  color = "#000000",
  gradient,
  children,
}) => {
  const background = gradient
    ? `linear-gradient(${gradient.direction || "to bottom"}, ${gradient.from}, ${gradient.to})`
    : color;

  return (
    <AbsoluteFill style={{ background }}>
      {children}
    </AbsoluteFill>
  );
};
