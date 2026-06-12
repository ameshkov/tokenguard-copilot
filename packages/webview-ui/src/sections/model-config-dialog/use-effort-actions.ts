import type { Dispatch, SetStateAction } from 'react';

/**
 * Hook that manages reasoning effort add/remove actions.
 *
 * Keeps the reasoningEffortMap state and related logic
 * out of the {@link ModelConfigDialog} component to stay
 * within function line limits.
 *
 * @param reasoningEffortMap - The current effort map.
 * @param setReasoningEffortMap - Setter for the effort map.
 * @param defaultReasoningEffort - The currently selected default effort.
 * @param setDefaultReasoningEffort - Setter for the default effort.
 * @param setErrors - Setter for the errors state.
 * @returns Add and remove action callbacks, plus effortNames.
 */
export function useEffortActions(
  reasoningEffortMap: Record<string, string>,
  setReasoningEffortMap: Dispatch<SetStateAction<Record<string, string>>>,
  defaultReasoningEffort: string,
  setDefaultReasoningEffort: (v: string) => void,
  setErrors: Dispatch<SetStateAction<Record<string, string>>>,
): {
  /** Sorted list of effort names. */
  effortNames: string[];
  /**
   * Adds a new effort entry from the add-effort form inputs.
   *
   * @param newEffortName - The effort name input value.
   * @param newEffortParams - The effort params JSON input value.
   * @param setNewEffortName - Setter to clear after add.
   * @param setNewEffortParams - Setter to clear after add.
   */
  addEffort: (
    newEffortName: string,
    newEffortParams: string,
    setNewEffortName: (v: string) => void,
    setNewEffortParams: (v: string) => void,
  ) => void;
  /**
   * Removes an effort entry from the map.
   *
   * @param name - The effort name to remove.
   */
  removeEffort: (name: string) => void;
} {
  const effortNames = Object.keys(reasoningEffortMap);

  const addEffort = (
    newEffortName: string,
    newEffortParams: string,
    setNewEffortName: (v: string) => void,
    setNewEffortParams: (v: string) => void,
  ) => {
    const name = newEffortName.trim();
    if (!name || effortNames.includes(name)) return;
    const params = newEffortParams.trim();
    if (params) {
      try {
        const parsed = JSON.parse(params);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          setErrors((prev) => ({ ...prev, newEffortParams: 'Must be a JSON object' }));
          return;
        }
      } catch {
        setErrors((prev) => ({ ...prev, newEffortParams: 'Invalid JSON' }));
        return;
      }
    }
    setReasoningEffortMap((prev) => ({ ...prev, [name]: params }));
    setNewEffortName('');
    setNewEffortParams('');
    setErrors((prev) => {
      if (!('newEffortParams' in prev)) return prev;
      const next = { ...prev };
      delete next.newEffortParams;
      return next;
    });
  };

  const removeEffort = (name: string) => {
    setReasoningEffortMap((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    if (defaultReasoningEffort === name) {
      setDefaultReasoningEffort('');
    }
  };

  return { effortNames, addEffort, removeEffort };
}
