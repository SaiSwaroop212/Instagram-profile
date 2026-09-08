import React from "react";

export function LoadingSkeleton({ count = 3 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <article
          key={`skeleton-${index}`}
          className="grid-post skeleton"
          aria-hidden="true"
        />
      ))}
    </>
  );
}

export default LoadingSkeleton;
