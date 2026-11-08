/**
 * 引擎单例入口：按运行目标选择 Web(wasm) 或 桌面(原生) 实现。
 * UI 只依赖这里导出的 getEngine()。
 */
import type { AudioEngine, EngineCapabilities } from '@audio-studio/shared';
import { WasmFfmpegEngine } from './WasmFfmpegEngine';
import { NativeEngine } from './NativeEngine';
import { isDesktop } from '../platform';

let engine: AudioEngine | null = null;
let initPromise: Promise<EngineCapabilities> | null = null;

export function getEngine(): AudioEngine {
  if (!engine) {
    engine = isDesktop ? new NativeEngine() : new WasmFfmpegEngine(2);
  }
  return engine;
}

/** 初始化引擎并返回能力（并发调用共享同一个 Promise） */
export function initEngine(): Promise<EngineCapabilities> {
  if (!initPromise) {
    initPromise = getEngine().init().catch((e) => {
      initPromise = null; // 失败允许重试
      throw e;
    });
  }
  return initPromise;
}

export function engineInitialized(): boolean {
  return initPromise !== null;
}

/** Web 版调整并发 */
export function setEngineConcurrency(n: number): void {
  const e = getEngine();
  if (e instanceof WasmFfmpegEngine) e.setConcurrency(n);
}

export { WasmFfmpegEngine } from './WasmFfmpegEngine';
export { NativeEngine } from './NativeEngine';
