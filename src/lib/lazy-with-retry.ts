import { lazy, type ComponentType } from "react";
import { recoverFromModuleLoadError } from "@/lib/module-recovery";

type ComponentModule<T extends ComponentType<unknown>> = { default: T };

/** Repete uma importação transitória e recupera builds antigos sem loop de recarga. */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  importer: () => Promise<ComponentModule<T>>,
) {
  return lazy(async () => {
    try {
      return await importer();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
      try {
        return await importer();
      } catch (error) {
        await recoverFromModuleLoadError(error);
        throw error;
      }
    }
  });
}