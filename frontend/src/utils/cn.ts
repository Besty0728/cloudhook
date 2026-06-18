/**
 * className 合并工具
 *
 * CloudHook 已安装 clsx，但未安装 tailwind-merge，
 * 因此用 clsx 实现基础合并。对于 Tailwind 类冲突，
 * 调用方自行保证传入顺序（后者覆盖前者的约定由调用方控制）。
 */

import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
