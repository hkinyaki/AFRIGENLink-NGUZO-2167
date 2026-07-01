import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { authClient } from "./auth";

export type Me = {
  user: { id: string; email: string; name: string; twoFactorEnabled?: boolean };
  profile: {
    id: string;
    role: string;
    userCode?: string | null;
    username?: string | null;
    companyName: string;
    verificationStatus: string;
    phone: string | null;
    fullName?: string | null;
    agentNumber?: string | null;
    photoKey?: string | null;
    managerId?: string | null;
    mustChangePassword?: boolean | null;
    onboardingComplete?: boolean | null;
    fieldStation?: string | null;
    nationalId?: string | null;
    address?: string | null;
    bankName?: string | null;
    bankAccountName?: string | null;
    bankAccountNo?: string | null;
    bankSwift?: string | null;
    bankBranch?: string | null;
    logoKey?: string | null;
    kamActivityStatus?: string | null;
    lastSeenAt?: number | null;
    contactEmail?: string | null;
    hasMasterPin?: boolean | null;
  };
};

export function useMe() {
  const { data: session, isPending } = authClient.useSession();
  const q = useQuery({
    queryKey: ["me", session?.user?.id],
    enabled: !!session?.user,
    queryFn: async (): Promise<Me> => {
      const res = await api.me.$get();
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as Me;
    },
  });
  return {
    isLoading: isPending || (!!session?.user && q.isLoading),
    session,
    me: q.data,
    refetch: q.refetch,
  };
}
