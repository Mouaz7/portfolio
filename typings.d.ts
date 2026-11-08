declare namespace React {
  interface CSSProperties {
    [customProperty: `--${string}`]: string | number | undefined;
  }
}
