import { useEffect } from "react";
import { Fancybox } from "@fancyapps/ui";
import "@fancyapps/ui/dist/fancybox/fancybox.css";

const defaultOptions = {};

const Lightbox = ({ selector, options = defaultOptions, refreshKey }) => {
  useEffect(() => {
    Fancybox.bind(selector, options);

    return () => {
      Fancybox.unbind(selector);
      Fancybox.close();
    };
  }, [options, refreshKey, selector]);

  return null;
};

export default Lightbox;
