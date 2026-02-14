"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  Users,
  Package,
  TrendingUp,
  Edit3,
  Trash2,
  CalendarDays,
} from "lucide-react";

interface InventoryItem {
  name: string;
  rem: number;
  tot: number;
}
interface Mitra {
  id: string;
  full_name: string;
  current_tier: string;
  is_rp: boolean;
  belanjaPusat: number;
  penjualanKonsumen: number;
  belanjaKotorAkumulasi: number;
  valueProdukMitra: number; // Kolom baru untuk balance
  inventory: InventoryItem[];
}
interface RawMitra {
  id: string;
  full_name: string;
  current_tier: string;
  is_rp: boolean;
}
interface RawTransaction {
  mitra_id: string;
  paid_amount: number;
}
interface RawReport {
  mitra_id: string;
  qty: number;
  selling_price: number;
  commission_rate: number;
}
interface RawInvItem {
  qty: number;
  remaining_qty_at_partner: number;
  product: { name: string; base_price: number } | null;
  transactions: { mitra_id: string; created_at: string } | null;
}

export default function MitraPage() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();

  const selectedMonth = useMemo(
    () => Number(searchParams.get("month")) || new Date().getMonth() + 1,
    [searchParams],
  );
  const selectedYear = useMemo(
    () => Number(searchParams.get("year")) || new Date().getFullYear(),
    [searchParams],
  );

  const [mitraList, setMitraList] = useState<Mitra[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [form, setForm] = useState({
    id: "",
    name: "",
    tier: "Member",
    is_rp: false,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [tierFilter, setTierFilter] = useState("All");

  const months = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];

  const fetchData = useCallback(async () => {
    setLoading(true);
    const start = new Date(
      selectedYear,
      selectedMonth - 1,
      1,
      0,
      0,
      0,
      0,
    ).toISOString();
    const end = new Date(
      selectedYear,
      selectedMonth,
      0,
      23,
      59,
      59,
      999,
    ).toISOString();

    const [mRes, tRes, rRes, iRes] = await Promise.all([
      supabase.from("mitra").select("*").order("full_name"),
      supabase
        .from("transactions")
        .select("mitra_id, paid_amount")
        .gte("created_at", start)
        .lte("created_at", end),
      supabase
        .from("partner_reports")
        .select("mitra_id, qty, selling_price, commission_rate")
        .gte("created_at", start)
        .lte("created_at", end),
      supabase
        .from("transaction_items")
        .select(
          `qty, remaining_qty_at_partner, product:product_id(name, base_price), transactions!inner(mitra_id, created_at)`,
        )
        .lte("transactions.created_at", end),
    ]);

    if (mRes.data) {
      const rawM = mRes.data as RawMitra[];
      const rawT = (tRes.data as unknown as RawTransaction[]) || [];
      const rawR = (rRes.data as unknown as RawReport[]) || [];
      const rawI = (iRes.data as unknown as RawInvItem[]) || [];

      // Mapping Rate Diskon
      const rates: Record<string, number> = {
        "Member": 0,
        "Reseller": 0.15,
        "Sub-Agen": 0.25,
        "Agen": 0.35,
        "Distributor": 0.45,
      };

      const enriched: Mitra[] = rawM.map((m) => {
        const belanjaTunaiBulanIni = rawT
          .filter((t) => t.mitra_id === m.id)
          .reduce((a, c) => a + c.paid_amount, 0);
        const pelunasanPiutangBulanIni = rawR
          .filter((r) => r.mitra_id === m.id)
          .reduce(
            (a, c) => a + (c.selling_price - c.commission_rate) * c.qty,
            0,
          );
        const omzet = rawR
          .filter((r) => r.mitra_id === m.id)
          .reduce((a, c) => a + c.selling_price * c.qty, 0);

        const myInv = rawI.filter((inv) => inv.transactions?.mitra_id === m.id);
        const totalBrutoBulanIni = myInv
          .filter(
            (inv) => inv.transactions && inv.transactions.created_at >= start,
          )
          .reduce(
            (acc, curr) => acc + curr.qty * (curr.product?.base_price || 0),
            0,
          );

        // Hitung Value Produk (Bruto - Diskon Tier)
        const discountRate = rates[m.current_tier] || 0;
        const valueBersihBulanIni = totalBrutoBulanIni * (1 - discountRate);

        const groupedStok = myInv.reduce(
          (acc: Record<string, { rem: number; tot: number }>, curr) => {
            const name = curr.product?.name || "Produk";
            if (!acc[name]) acc[name] = { rem: 0, tot: 0 };
            acc[name].rem += curr.remaining_qty_at_partner;
            acc[name].tot += curr.qty;
            return acc;
          },
          {},
        );

        return {
          ...m,
          belanjaPusat: belanjaTunaiBulanIni + pelunasanPiutangBulanIni, // NETTO KE PUSAT
          penjualanKonsumen: omzet,
          belanjaKotorAkumulasi: totalBrutoBulanIni, // TOTAL BRUTO
          valueProdukMitra: valueBersihBulanIni, // VALUE PRODUK MITRA
          inventory: Object.entries(groupedStok).map(([name, val]) => ({
            name,
            rem: val.rem,
            tot: val.tot,
          })),
        };
      });

      setMitraList(enriched);
      setLoading(false);
    }
  }, [supabase, selectedMonth, selectedYear]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (isMounted) await fetchData();
    })();
    return () => {
      isMounted = false;
    };
  }, [fetchData, refreshKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      full_name: form.name,
      current_tier: form.tier,
      is_rp: form.is_rp,
    };
    const toastId = toast.loading("Processing...");
    const { error } = isEditing
      ? await supabase.from("mitra").update(payload).eq("id", form.id)
      : await supabase.from("mitra").insert([payload]);
    if (!error) {
      toast.success("Berhasil!", { id: toastId });
      setIsEditing(false);
      setForm({ id: "", name: "", tier: "Member", is_rp: false });
      setRefreshKey((p) => p + 1);
    } else toast.error("Gagal!", { id: toastId });
  };

  const handleDelete = async (id: string) => {
    if (confirm("Hapus mitra?")) {
      await supabase.from("mitra").delete().eq("id", id);
      toast.success("Dihapus!");
      setRefreshKey((p) => p + 1);
    }
  };

  const filtered = useMemo(() => {
    return mitraList.filter((m) => {
      const matchSearch = m.full_name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchTier = tierFilter === "All" || m.current_tier === tierFilter;
      return matchSearch && matchTier;
    });
  }, [mitraList, searchTerm, tierFilter]);

  if (loading)
    return (
      <div className="p-20 text-center font-black animate-pulse text-green-800 uppercase italic">
        Sync Database...
      </div>
    );

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans text-gray-900">
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <Users size={36} className="text-green-900" />
          <h1 className="text-4xl font-black text-green-900 italic uppercase tracking-tighter">
            Database Mitra
          </h1>
        </div>
        <div className="bg-blue-50 px-4 py-2 rounded-2xl border border-blue-100 flex items-center gap-2">
          <CalendarDays size={16} className="text-blue-600" />
          <span className="text-[10px] font-black uppercase text-blue-600 tracking-widest">
            Periode Analisis: {months[selectedMonth - 1]} {selectedYear}
          </span>
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-[35px] shadow-2xl mb-12 border border-gray-100"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <input
            placeholder="Nama Lengkap"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="p-4 bg-gray-50 border rounded-2xl font-bold outline-none focus:ring-2 focus:ring-green-500"
            required
          />
          <select
            value={form.is_rp ? "RP" : "REGULER"}
            onChange={(e) => {
              const isRP = e.target.value === "RP";
              setForm({
                ...form,
                is_rp: isRP,
                tier: isRP ? "Reseller" : form.tier,
              });
            }}
            className="p-4 bg-gray-50 border rounded-2xl font-bold"
          >
            <option value="REGULER">Mitra Reguler</option>
            <option value="RP">Rumah Perubahan (VIP)</option>
          </select>
          <select
            value={form.tier}
            onChange={(e) => setForm({ ...form, tier: e.target.value })}
            className={`p-4 border rounded-2xl font-bold outline-none ${form.is_rp ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-gray-50 border-gray-200"}`}
          >
            <option value="Member">Member</option>
            <option value="Reseller">Reseller</option>
            <option value="Sub-Agen">Sub-Agen</option>
            <option value="Agen">Agen</option>
            <option value="Distributor">Distributor</option>
          </select>
        </div>
        <button
          className={`w-full p-5 rounded-2xl font-black text-white shadow-lg uppercase tracking-widest text-xs transition-all ${isEditing ? "bg-orange-500" : "bg-green-800"}`}
        >
          {isEditing ? "Update Data" : "Daftarkan Sekarang"}
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <input
          placeholder="Cari nama mitra..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="md:col-span-2 p-4 bg-white border rounded-2xl shadow-sm font-bold outline-none focus:ring-2 focus:ring-green-500"
        />
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="p-4 bg-white border rounded-2xl shadow-sm font-bold outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="All">Semua Tier</option>
          <option value="Member">Member</option>
          <option value="Reseller">Reseller</option>
          <option value="Sub-Agen">Sub-Agen</option>
          <option value="Agen">Agen</option>
          <option value="Distributor">Distributor</option>
        </select>
      </div>

      <div className="bg-white rounded-[40px] shadow-sm overflow-hidden border border-gray-100">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b">
            <tr>
              <th className="p-8 border-r text-center w-16">NO</th>
              <th className="p-8">MITRA</th>
              <th className="p-8">STOK AKTIF</th>
              <th className="p-8 text-right bg-orange-50/20 border-r">
                TOTAL BRUTO
              </th>
              <th className="p-8 text-right bg-blue-50/20 border-r text-blue-700">
                VALUE PRODUK MITRA
              </th>
              <th className="p-8 text-right bg-green-900/10 border-r text-green-800">
                NETTO KE PUSAT
              </th>
              <th className="p-8 text-right bg-purple-50/10 border-r">OMZET</th>
              <th className="p-8 text-center">AKSI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((m, idx) => (
              <tr key={m.id} className="hover:bg-gray-50 transition-all group">
                <td className="p-8 text-center font-bold text-gray-300 border-r">
                  {idx + 1}
                </td>
                <td className="p-8">
                  <div className="font-bold text-gray-800 uppercase flex items-center gap-2">
                    {m.full_name}{" "}
                    {m.is_rp && (
                      <span className="text-[8px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full ring-1 ring-green-200">
                        RP
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] font-black bg-blue-600 text-white px-2 py-0.5 rounded-lg inline-block mt-2">
                    {m.current_tier}
                  </span>
                </td>
                <td className="p-8">
                  {m.inventory.map((inv, i) => (
                    <div
                      key={i}
                      className="text-[10px] font-black text-gray-400 uppercase italic mb-1"
                    >
                      <Package
                        size={10}
                        className="inline mr-1 text-green-600"
                      />
                      {inv.name}:{" "}
                      <span className="text-green-700">
                        {inv.rem} / {inv.tot}
                      </span>
                    </div>
                  ))}
                </td>
                <td className="p-8 text-right font-mono font-black text-orange-600 italic text-lg border-r bg-orange-50/10">
                  Rp {m.belanjaKotorAkumulasi.toLocaleString("id-ID")}
                </td>
                <td className="p-8 text-right font-mono font-black text-blue-700 italic text-lg border-r bg-blue-50/10">
                  Rp {m.valueProdukMitra.toLocaleString("id-ID")}
                </td>
                <td className="p-8 text-right font-mono font-black text-green-900 italic text-lg border-r bg-green-100/10">
                  Rp {m.belanjaPusat.toLocaleString("id-ID")}
                </td>
                <td className="p-8 text-right font-mono font-black text-purple-700 italic text-lg bg-purple-50/5 border-r">
                  Rp {m.penjualanKonsumen.toLocaleString("id-ID")}{" "}
                  <TrendingUp
                    size={16}
                    className="inline text-purple-400 ml-1"
                  />
                </td>
                <td className="p-8 text-center">
                  <div className="flex justify-center gap-4">
                    <button
                      onClick={() => {
                        setForm({
                          id: m.id,
                          name: m.full_name,
                          tier: m.current_tier,
                          is_rp: m.is_rp,
                        });
                        setIsEditing(true);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="p-3 bg-orange-50 text-orange-500 rounded-xl hover:bg-orange-500 hover:text-white transition-all"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
