import { useState } from "react";

export interface Profile {
  name: string;
  country: string;
  timezone: string;
  avatar: string | null;
}

const KEY = "mizan-profile";
const empty = (): Profile => ({
  name: "",
  country: "",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  avatar: null,
});

const load = (): Profile => {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return empty();
  }
};

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(load);
  const save = (next: Profile) => {
    setProfile(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };
  return { profile, save };
}
