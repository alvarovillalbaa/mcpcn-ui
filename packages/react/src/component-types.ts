export type ComponentAction = { type: string; data?: unknown };

export type ComponentProps<T> = T & {
  className?: string;
  onAction?: (action: ComponentAction) => void;
  busy?: boolean;
  error?: string;
};
