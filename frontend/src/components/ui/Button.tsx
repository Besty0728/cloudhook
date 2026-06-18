"use client";

import React from "react";
import { cn } from "@/utils/cn";
import { motion, MotionProps } from "framer-motion";

type MotionButtonProps = MotionProps & {
  asChild?: boolean;
  children?: React.ReactNode;
  className?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'refresh';
};

type HTMLButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "ref"
>;

const Button = React.forwardRef<
  HTMLButtonElement,
  MotionButtonProps & HTMLButtonProps
>(({ asChild = false, children, className, variant = 'primary', ...props }, ref) => {
  // refresh 变体 - 特殊处理
  if (variant === 'refresh') {
    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: 0.93 }}
        className={cn(
          "flex h-10 px-4 items-center justify-center gap-2 rounded-lg font-medium text-sm transition-colors duration-200 tracking-wide",
          "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
        {...props}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {children || '刷新'}
      </motion.button>
    );
  }

  // 变体样式映射
  const variantStyles = {
    primary: "bg-black text-white hover:bg-neutral-800",
    secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200",
    danger: "bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-500 hover:to-red-600",
    ghost: "bg-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100",
  };

  const classNames = cn(
    "flex h-10 px-6 items-center justify-center rounded-lg font-medium text-sm transition-colors duration-200 tracking-wide",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400",
    variantStyles[variant as keyof typeof variantStyles],
    className
  );

  if (asChild && React.isValidElement(children)) {
    return (
      <motion.span whileTap={{ scale: 0.93 }}>
        {React.cloneElement(children as React.ReactElement<any>, {
          className: cn((children as any).props.className, classNames),
          ref,
          ...props,
        })}
      </motion.span>
    );
  }

  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.93 }}
      className={classNames}
      {...props}
    >
      {children}
    </motion.button>
  );
});

Button.displayName = "Button";

export { Button };
export default Button;
