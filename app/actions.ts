"use server";
import { revalidatePath } from "next/cache";

export async function refreshAllData() {
  // Memaksa server membuang cache untuk Dashboard, Arus Kas, dan Manajemen Mitra
  revalidatePath("/dashboard");
  revalidatePath("/transaksi");
  revalidatePath("/mitra");
}
