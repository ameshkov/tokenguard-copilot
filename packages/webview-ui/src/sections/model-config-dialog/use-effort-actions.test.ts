import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEffortActions } from './use-effort-actions.js';

describe('useEffortActions', () => {
  const defaultProps = () => ({
    reasoningEffortMap: {} as Record<string, string>,
    setReasoningEffortMap: vi.fn(),
    defaultReasoningEffort: '',
    setDefaultReasoningEffort: vi.fn(),
    setErrors: vi.fn(),
  });

  it('returns empty effortNames initially', () => {
    const props = defaultProps();
    const { result } = renderHook(() =>
      useEffortActions(
        props.reasoningEffortMap,
        props.setReasoningEffortMap,
        props.defaultReasoningEffort,
        props.setDefaultReasoningEffort,
        props.setErrors,
      ),
    );
    expect(result.current.effortNames).toEqual([]);
  });

  it('returns existing effort names', () => {
    const { result } = renderHook(() =>
      useEffortActions({ low: '{}', high: '{}' }, vi.fn(), '', vi.fn(), vi.fn()),
    );
    expect(result.current.effortNames).toEqual(['low', 'high']);
  });

  it('addEffort rejects duplicate names', () => {
    const setMap = vi.fn();
    const setName = vi.fn();
    const setParams = vi.fn();
    const { result } = renderHook(() =>
      useEffortActions({ low: '{}' }, setMap, '', vi.fn(), vi.fn()),
    );

    act(() => {
      result.current.addEffort('low', '{}', setName, setParams);
    });

    expect(setMap).not.toHaveBeenCalled();
  });

  it('addEffort rejects empty name', () => {
    const setMap = vi.fn();
    const setName = vi.fn();
    const setParams = vi.fn();
    const { result } = renderHook(() => useEffortActions({}, setMap, '', vi.fn(), vi.fn()));

    act(() => {
      result.current.addEffort('', '{}', setName, setParams);
    });

    expect(setMap).not.toHaveBeenCalled();
  });

  it('addEffort adds a valid entry', () => {
    const setMap = vi.fn();
    const setName = vi.fn();
    const setParams = vi.fn();
    const { result } = renderHook(() => useEffortActions({}, setMap, '', vi.fn(), vi.fn()));

    act(() => {
      result.current.addEffort('medium', '{"reasoning_effort":"medium"}', setName, setParams);
    });

    expect(setMap).toHaveBeenCalled();
    expect(setName).toHaveBeenCalledWith('');
    expect(setParams).toHaveBeenCalledWith('');
  });

  it('addEffort rejects invalid JSON params', () => {
    const setMap = vi.fn();
    const setErrors = vi.fn();
    const setName = vi.fn();
    const setParams = vi.fn();
    const { result } = renderHook(() => useEffortActions({}, setMap, '', vi.fn(), setErrors));

    act(() => {
      result.current.addEffort('bad', 'not json', setName, setParams);
    });

    expect(setMap).not.toHaveBeenCalled();
    expect(setErrors).toHaveBeenCalled();
  });

  it('addEffort accepts empty params', () => {
    const setMap = vi.fn();
    const setName = vi.fn();
    const setParams = vi.fn();
    const { result } = renderHook(() => useEffortActions({}, setMap, '', vi.fn(), vi.fn()));

    act(() => {
      result.current.addEffort('low', '', setName, setParams);
    });

    expect(setMap).toHaveBeenCalled();
  });

  it('removeEffort removes an entry', () => {
    const setMap = vi.fn();
    const { result } = renderHook(() =>
      useEffortActions({ low: '{}' }, setMap, '', vi.fn(), vi.fn()),
    );

    act(() => {
      result.current.removeEffort('low');
    });

    expect(setMap).toHaveBeenCalled();
  });

  it('removeEffort clears defaultReasoningEffort when removing selected', () => {
    const setMap = vi.fn();
    const setDefault = vi.fn();
    const { result } = renderHook(() =>
      useEffortActions({ low: '{}' }, setMap, 'low', setDefault, vi.fn()),
    );

    act(() => {
      result.current.removeEffort('low');
    });

    expect(setDefault).toHaveBeenCalledWith('');
  });

  it('removeEffort does not clear defaultReasoningEffort when removing unselected', () => {
    const setMap = vi.fn();
    const setDefault = vi.fn();
    const { result } = renderHook(() =>
      useEffortActions({ low: '{}', high: '{}' }, setMap, 'high', setDefault, vi.fn()),
    );

    act(() => {
      result.current.removeEffort('low');
    });

    expect(setDefault).not.toHaveBeenCalled();
  });
});
