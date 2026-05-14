import React from 'react';

/**
 * Agora lightning-bolt icon — a stylized double-bolt mark in primary brand orange.
 * The artwork uses fixed brand colors and gradients (it's a logo mark, not a
 * monochrome icon), so it ignores `currentColor`. Pass `className` to size it
 * (e.g. `size-6`).
 */
export const AgoraBoltIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  ({ className, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 720 880"
      fill="none"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <g filter="url(#agora_bolt_inner_shadow)">
        <path
          d="M415.596 0L0 417.12L284.123 702.287L346.922 468.3H189.533L415.596 0Z"
          fill="url(#agora_bolt_grad_a)"
          fillOpacity="0.9"
        />
        <path
          d="M415.596 0L0 417.12L284.123 702.287L346.922 468.3H189.533L415.596 0Z"
          fill="#FF6600"
        />
        <path
          d="M431.879 127.936L363.762 381.328H527.876L258.808 880L720 417.114L431.879 127.936Z"
          fill="url(#agora_bolt_grad_b)"
          fillOpacity="0.9"
        />
        <path
          d="M431.879 127.936L363.762 381.328H527.876L258.808 880L720 417.114L431.879 127.936Z"
          fill="#FF6600"
        />
      </g>
      <defs>
        <filter
          id="agora_bolt_inner_shadow"
          x="0"
          y="0"
          width="720"
          height="914"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="34" />
          <feGaussianBlur stdDeviation="27" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.25 0"
          />
          <feBlend mode="normal" in2="shape" result="effect1_innerShadow" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="7" />
          <feGaussianBlur stdDeviation="0.5" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.25 0"
          />
          <feBlend mode="normal" in2="effect1_innerShadow" result="effect2_innerShadow" />
        </filter>
        <linearGradient
          id="agora_bolt_grad_a"
          x1="-19.0481"
          y1="318.823"
          x2="373.469"
          y2="591.355"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient
          id="agora_bolt_grad_b"
          x1="346.531"
          y1="288.645"
          x2="739.048"
          y2="561.177"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0.5" />
        </linearGradient>
      </defs>
    </svg>
  ),
);

AgoraBoltIcon.displayName = 'AgoraBoltIcon';
