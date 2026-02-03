import * as React from "react";

export function TriangleFillIcon({
  size = 12,
  className,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  size?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="currentColor"
      className={className}
      {...props}
    >
      <polygon points="5,1 9,9 1,9" />
    </svg>
  );
}
