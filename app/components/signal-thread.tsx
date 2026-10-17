import { useId } from "react";

export function SignalThread({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg
      className={className}
      viewBox="0 0 600 460"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={id}
          x1="80"
          y1="70"
          x2="540"
          y2="420"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#dfcda2" stopOpacity=".1" />
          <stop offset=".48" stopColor="#d8a35d" stopOpacity=".8" />
          <stop offset="1" stopColor="#d8a35d" stopOpacity=".08" />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop stopColor="#d9a45c" stopOpacity=".11" />
          <stop offset="1" stopColor="#d9a45c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="310" cy="240" rx="260" ry="210" fill={`url(#${id}-glow)`} />
      <g stroke={`url(#${id})`} strokeWidth=".85">
        {Array.from({ length: 11 }, (_, i) => (
          <ellipse
            key={i}
            cx={250 + i * 11}
            cy="225"
            rx={75 + i * 8}
            ry={170 - i * 4}
            transform={`rotate(${30 + i * 3} ${250 + i * 11} 225)`}
          />
        ))}
      </g>
      <path
        d="M20 307C127 322 119 137 234 166S352 335 415 242 500 147 585 175"
        stroke="#d1a260"
        strokeWidth="1.5"
      />
      <g fill="#e8c17e">
        <circle cx="234" cy="166" r="3" />
        <circle cx="339" cy="258" r="3" />
        <circle cx="415" cy="242" r="3" />
        <circle cx="234" cy="166" r="9" fillOpacity=".08" />
        <circle cx="415" cy="242" r="10" fillOpacity=".08" />
      </g>
    </svg>
  );
}

export function ScoreRing({
  score,
  className,
}: {
  score: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="50"
        cy="50"
        r="45"
        stroke="currentColor"
        opacity=".12"
        strokeWidth="1"
      />
      <circle
        cx="50"
        cy="50"
        r="45"
        pathLength="100"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={`${Math.max(0, Math.min(100, score))} 100`}
        transform="rotate(-90 50 50)"
        strokeLinecap="round"
      />
      <circle cx="50" cy="5" r="2.5" fill="currentColor" />
    </svg>
  );
}
