import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

const UndoContext = createContext(null);
const MAX_UNDO_STEPS = 5;

export function UndoProvider({ children }) {
  const [activeScope, setActiveScope] = useState(null);
  const [stacks, setStacks] = useState({});
  const [undoing, setUndoing] = useState(false);
  const handlersRef = useRef({});

  const registerUndoHandler = useCallback((scope, handler) => {
    if (!scope || !handler) return () => {};
    handlersRef.current[scope] = handler;
    return () => {
      if (handlersRef.current[scope] === handler) {
        delete handlersRef.current[scope];
      }
    };
  }, []);

  const pushUndo = useCallback((scope, action) => {
    if (!scope || !action) return;
    setStacks((current) => {
      const nextStack = [...(current[scope] || []), action].slice(-MAX_UNDO_STEPS);
      return { ...current, [scope]: nextStack };
    });
  }, []);

  const undoLast = useCallback(async () => {
    if (!activeScope || undoing) return;
    const stack = stacks[activeScope] || [];
    const action = stack[stack.length - 1];
    const handler = handlersRef.current[activeScope];
    if (!action || !handler) return;

    setUndoing(true);
    try {
      const result = await handler(action);
      if (result !== false) {
        setStacks((current) => ({
          ...current,
          [activeScope]: (current[activeScope] || []).slice(0, -1),
        }));
      }
    } finally {
      setUndoing(false);
    }
  }, [activeScope, stacks, undoing]);

  const activeStack = activeScope ? stacks[activeScope] || [] : [];
  const activeAction = activeStack[activeStack.length - 1] || null;
  const canUndo = Boolean(activeScope && activeAction && handlersRef.current[activeScope] && !undoing);

  const value = useMemo(() => ({
    activeAction,
    activeScope,
    activeStack,
    canUndo,
    pushUndo,
    registerUndoHandler,
    setActiveScope,
    undoing,
    undoLast,
  }), [activeAction, activeScope, activeStack, canUndo, pushUndo, registerUndoHandler, undoing, undoLast]);

  return (
    <UndoContext.Provider value={value}>
      {children}
    </UndoContext.Provider>
  );
}

export function useUndo() {
  const context = useContext(UndoContext);
  if (!context) {
    throw new Error("useUndo must be used inside UndoProvider");
  }
  return context;
}
