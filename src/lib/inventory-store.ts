import { create } from "zustand";

type InventoryState = {
  lastMutationAt: number;
  bump: () => void;
};

/**
 * Global signal used by any inventory-touching action.
 * Dashboards / employee files can subscribe to `lastMutationAt`
 * to refetch without prop drilling.
 */
export const useInventoryStore = create<InventoryState>((set) => ({
  lastMutationAt: 0,
  bump: () => set({ lastMutationAt: Date.now() }),
}));

export const bumpInventory = () => useInventoryStore.getState().bump();
