/* © 2026 Aditum — Aditum FieldOps — Auth context & guards */
import { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { Role } from './types';

export interface SessionUser {
  uid: string;
  email: string;
  name: string;
  role: Role;
  initials: string;
  active: boolean;
}

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null as any);
export const useAuth = () => useContext(Ctx);

export class InactiveUserError extends Error {}

async function resolveSession(fbUser: User): Promise<SessionUser> {
  const tokenResult = await fbUser.getIdTokenResult();
  let role = (tokenResult.claims.role as Role) || undefined;
  const snap = await getDoc(doc(db, 'users', fbUser.uid));
  const data = snap.exists() ? (snap.data() as any) : {};
  if (!role) role = data.role || 'tech';
  const active = data.active !== false;
  return {
    uid: fbUser.uid,
    email: fbUser.email || data.email || '',
    name: data.name || fbUser.displayName || fbUser.email || '',
    role: role as Role,
    initials: data.initials || (fbUser.email || '?').slice(0, 2).toUpperCase(),
    active,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const session = await resolveSession(fbUser);
          if (!session.active) {
            await signOut(auth);
            setUser(null);
          } else {
            setUser(session);
          }
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
  }, []);

  const login = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    const session = await resolveSession(cred.user);
    if (!session.active) {
      await signOut(auth);
      throw new InactiveUserError();
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}
