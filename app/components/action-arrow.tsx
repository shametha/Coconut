export function ActionArrow({
  direction = "up",
}: {
  direction?: "up" | "down";
}) {
  return (
    <svg
      className="action-arrow"
      data-action-arrow={direction}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="action-arrow-disc" cx="12" cy="12" r="20" />
      <path
        className="action-arrow-line"
        d="M3 12H21M15 6L21 12L15 18"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
