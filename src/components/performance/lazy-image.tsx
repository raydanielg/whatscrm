import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  /** Optional low-quality placeholder (data URI or tiny image). */
  placeholder?: string;
  /** Aspect ratio hint to prevent CLS, e.g. "16 / 9". */
  aspectRatio?: string;
};

/**
 * LazyImage — IntersectionObserver-driven, native `loading="lazy"`,
 * decodes async, reserves aspect ratio to prevent CLS. Falls back to
 * eager loading if IO is unavailable.
 */
export function LazyImage({
  src,
  placeholder,
  aspectRatio,
  className,
  alt = "",
  style,
  ...rest
}: Props) {
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <img
      ref={ref}
      src={visible ? src : placeholder}
      alt={alt}
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      className={className}
      style={{
        aspectRatio,
        transition: "opacity 200ms ease",
        opacity: loaded || !visible ? 1 : 0.4,
        backgroundColor: "hsl(var(--muted))",
        ...style,
      }}
      {...rest}
    />
  );
}
