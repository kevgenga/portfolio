import { useEffect, useRef, useState } from "react";

const InstagramSketchbook = () => {
  const widgetRef = useRef(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget) return undefined;

    const detectWidget = () => {
      if (widget.children.length > 0) setIsReady(true);
    };
    const observer = new MutationObserver(detectWidget);
    observer.observe(widget, { childList: true, subtree: true });
    detectWidget();

    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="relative mt-10 min-h-[560px] overflow-x-hidden border-[3px] border-ink bg-page py-3 sm:min-h-[620px] sm:py-6 lg:min-h-[680px]"
      aria-busy={!isReady}
    >
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center" role="status">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">
            Recent work loading
          </p>
        </div>
      )}
      <div
        ref={widgetRef}
        className="elfsight-app-d28a8d13-61ef-48e5-acf8-2adecc403d9e relative z-10 mx-auto min-h-[520px] w-full max-w-6xl overflow-x-hidden sm:min-h-[580px] lg:min-h-[640px]"
        data-elfsight-app-lazy
      />
    </div>
  );
};

export default InstagramSketchbook;
