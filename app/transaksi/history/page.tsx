"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  Search,
  History as HistoryIcon,
  CalendarDays,
  TrendingUp,
  Package,
  Trash2,
  CreditCard,
} from "lucide-react";

// --- Interface Definisi ---
interface CombinedHistory {
  id: string;
  type: "ORDER" | "SALE";
  created_at: string;
  mitra_name: string;
  mitra_id: string;
  tier: string;
  product_id?: string;
  product_details: string;
  qty: number;
  paid: number;
  unpaid: number;
  status: string;
  method: string;
}

interface RawTransaction {
  id: string;
  created_at: string;
  paid_amount: number;
  total_amount: number;
  payment_status: string;
  payment_method: string;
  mitra_id: string;
  mitra: { full_name: string; current_tier: string } | null;
  transaction_items: {
    qty: number;
    product_id: string;
    product: { name: string } | null;
  }[];
}

// FIX: Tambahkan interface khusus untuk data report agar tidak pakai 'any'
interface ReportItem {
  id: string;
  created_at: string;
  qty: number;
  selling_price: number;
  commission_rate: number;
  mitra_id: string;
  product_id: string;
  mitra: { full_name: string; current_tier: string } | null;
  product: { name: string } | null;
}

interface StockBatch {
  id: string;
  remaining_qty_at_partner: number;
  transactions: {
    id: string;
    total_amount: number;
    paid_amount: number;
    payment_method: string;
  } | null;
}

export default function ArusKasPusatPage() {
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

  const [history, setHistory] = useState<CombinedHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");

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

  const loadHistory = useCallback(async () => {
    setLoading(true);
    const start = new Date(
      selectedYear,
      selectedMonth - 1,
      1,
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
    ).toISOString();

    const [transData, reportsData] = await Promise.all([
      supabase
        .from("transactions")
        .select(
          `id, created_at, paid_amount, total_amount, payment_status, payment_method, mitra_id, mitra:mitra_id(full_name, current_tier), transaction_items(qty, product_id, product:product_id(name))`,
        )
        .eq("is_sample", false)
        .gte("created_at", start)
        .lte("created_at", end),
      supabase
        .from("partner_reports")
        .select(
          `id, created_at, qty, selling_price, commission_rate, mitra_id, product_id, mitra:mitra_id(full_name, current_tier), product:product_id(name)`,
        )
        .gte("created_at", start)
        .lte("created_at", end),
    ]);

    // FIX: Gunakan interface ReportItem di sini
    const reportsRaw = (reportsData.data as unknown as ReportItem[]) || [];
    const trans = (transData.data as unknown as RawTransaction[]) || [];
    const combined: CombinedHistory[] = [];

    // 1. Map Pengambilan Barang
    trans.forEach((t) => {
      combined.push({
        id: t.id,
        type: "ORDER",
        created_at: t.created_at,
        mitra_name: t.mitra?.full_name || "N/A",
        mitra_id: t.mitra_id,
        tier: t.mitra?.current_tier || "Member",
        product_details: t.transaction_items
          .map((i) => `${i.product?.name || "Produk"} (${i.qty} Pcs)`)
          .join(", "),
        qty: t.transaction_items[0]?.qty || 0,
        paid: t.paid_amount,
        unpaid: t.total_amount,
        status: t.payment_status,
        method: t.payment_method || "N/A",
      });
    });

    // 2. Map Penjualan
    for (const r of reportsRaw) {
      const { data: batchData } = await supabase
        .from("transaction_items")
        .select(`transactions(payment_method)`)
        .eq("product_id", r.product_id)
        .eq("transactions.mitra_id", r.mitra_id)
        .order("id", { ascending: false })
        .limit(1)
        .single();

      const batchResult = batchData as unknown as {
        transactions: { payment_method: string };
      };
      const method = batchResult?.transactions?.payment_method || "Piutang";
      const isBeliPutus = method === "QRIS" || method === "Transfer";

      combined.push({
        id: r.id,
        type: "SALE",
        created_at: r.created_at,
        mitra_name: r.mitra?.full_name || "N/A",
        mitra_id: r.mitra_id,
        product_id: r.product_id,
        tier: r.mitra?.current_tier || "Member",
        product_details: `Laku Jual: ${r.product?.name || "Produk"} (${r.qty} Pcs)`,
        qty: r.qty,
        paid: isBeliPutus ? 0 : (r.selling_price - r.commission_rate) * r.qty,
        unpaid: 0,
        status: isBeliPutus
          ? "LUNAS (BELI PUTUS)"
          : "LUNAS (PELUNASAN PIUTANG)",
        method: "Sistem",
      });
    }

    setHistory(
      combined.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    );
    setLoading(false);
  }, [supabase, selectedMonth, selectedYear]);

  useEffect(() => {
    const triggerFetch = async () => {
      await loadHistory();
    };
    triggerFetch();
  }, [loadHistory]);

  const handleUniversalDelete = async (item: CombinedHistory) => {
    if (
      !confirm(
        `Hapus data ${item.type === "ORDER" ? "ambil barang" : "laku jualan"} ini?`,
      )
    )
      return;
    const toastId = toast.loading("Sinkronisasi Reversal...");
    try {
      if (item.type === "ORDER") {
        const { data: orderItems } = await supabase
          .from("transaction_items")
          .select("qty, product_id")
          .eq("transaction_id", item.id);
        if (orderItems) {
          for (const oi of orderItems) {
            const { data: p } = await supabase
              .from("products")
              .select("stock")
              .eq("id", oi.product_id)
              .single();
            if (p)
              await supabase
                .from("products")
                .update({ stock: p.stock + oi.qty })
                .eq("id", oi.product_id);
          }
        }
        await supabase.from("transactions").delete().eq("id", item.id);
      } else {
        const { data: rawBatch } = await supabase
          .from("transaction_items")
          .select(
            `id, remaining_qty_at_partner, transactions!inner(id, total_amount, paid_amount, payment_method)`,
          )
          .eq("product_id", item.product_id)
          .eq("transactions.mitra_id", item.mitra_id)
          .order("id", { ascending: false })
          .limit(1)
          .single();

        const batch = rawBatch as unknown as StockBatch;

        if (batch && batch.transactions) {
          await supabase
            .from("transaction_items")
            .update({
              remaining_qty_at_partner:
                (batch.remaining_qty_at_partner || 0) + item.qty,
            })
            .eq("id", batch.id);

          const isBeliPutus =
            batch.transactions.payment_method === "QRIS" ||
            batch.transactions.payment_method === "Transfer";
          if (!isBeliPutus) {
            const tx = batch.transactions;
            await supabase
              .from("transactions")
              .update({
                total_amount: Math.round(Number(tx.total_amount) + item.paid),
                paid_amount: Math.round(
                  Math.max(0, Number(tx.paid_amount) - item.paid),
                ),
                payment_status: "Unpaid",
              })
              .eq("id", tx.id);
          }
        }
        await supabase.from("partner_reports").delete().eq("id", item.id);
      }
      toast.success("Data di-reset!", { id: toastId });
      await loadHistory();
    } catch {
      toast.error("Gagal hapus!");
    }
  };

  const filteredData = useMemo(() => {
    return history.filter(
      (h) =>
        h.mitra_name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (typeFilter === "All" || h.type === typeFilter),
    );
  }, [history, searchTerm, typeFilter]);

  if (loading)
    return (
      <div className="p-20 text-center font-black animate-pulse text-green-800 uppercase italic">
        Sync Arus Kas...
      </div>
    );

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans text-gray-900">
      <header className="mb-10 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <HistoryIcon size={36} className="text-green-900" />
          <h1 className="text-4xl font-black text-green-900 italic uppercase tracking-tighter">
            Arus Kas Gabungan
          </h1>
        </div>
        <div className="bg-blue-50 px-4 py-2 rounded-2xl border flex items-center gap-2">
          <CalendarDays size={16} />
          <span className="text-[10px] font-black uppercase text-blue-600 tracking-widest">
            Periode: {months[selectedMonth - 1]} {selectedYear}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="md:col-span-2 relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300"
            size={18}
          />
          <input
            placeholder="Cari nama mitra..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-4 pl-12 bg-white border rounded-2xl shadow-sm font-bold outline-none"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="p-4 bg-white border rounded-2xl shadow-sm font-bold outline-none cursor-pointer"
        >
          <option value="All">Semua Aktivitas</option>
          <option value="ORDER">Pengambilan Barang</option>
          <option value="SALE">Pelunasan Jualan</option>
        </select>
      </div>

      <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b">
            <tr>
              <th className="p-8 border-r text-center w-16">No</th>
              <th className="p-8">Waktu & Mitra</th>
              <th className="p-8">Metode</th>
              <th className="p-8">Detail Produk</th>
              <th className="p-8 text-right bg-green-50/20 border-r">
                Dana Masuk
              </th>
              <th className="p-8 text-right bg-red-50/10 border-r">
                Sisa Piutang
              </th>
              <th className="p-8 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredData.length > 0 ? (
              filteredData.map((h, idx) => (
                <tr key={h.id} className="hover:bg-gray-50 transition-all">
                  <td className="p-8 text-center font-bold text-gray-300 border-r">
                    {idx + 1}
                  </td>
                  <td className="p-8 border-r">
                    <div className="text-[10px] font-bold text-gray-400">
                      {new Date(h.created_at).toLocaleDateString("id-ID")}
                    </div>
                    <div className="font-bold text-gray-800 uppercase">
                      {h.mitra_name}
                    </div>
                    <div className="flex gap-2 mt-2 items-center">
                      <span className="text-[8px] font-black bg-blue-600 text-white px-2 py-0.5 rounded-lg shadow-sm">
                        {h.tier}
                      </span>
                      {h.type === "ORDER" ? (
                        <span className="flex items-center gap-1 text-[8px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          <Package size={10} /> AMBIL BARANG
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[8px] font-black bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          <TrendingUp size={10} /> LAKU JUALAN
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-8 border-r">
                    <div className="flex items-center gap-1.5 text-[10px] font-black text-blue-600 uppercase italic">
                      <CreditCard size={12} /> {h.method}
                    </div>
                  </td>
                  <td className="p-8 text-[11px] font-bold text-gray-500 italic border-r">
                    {h.product_details}
                  </td>
                  <td className="p-8 text-right border-r bg-green-50/20 font-mono font-black text-green-700 text-lg">
                    Rp {h.paid.toLocaleString("id-ID")}
                  </td>
                  <td className="p-8 text-right border-r bg-red-50/10 font-mono font-black text-red-600 text-lg">
                    Rp {h.unpaid.toLocaleString("id-ID")}
                  </td>
                  <td className="p-8 text-center">
                    <button
                      onClick={() => handleUniversalDelete(h)}
                      className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={7}
                  className="p-20 text-center text-gray-300 font-bold italic uppercase"
                >
                  Tidak ada data arus kas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
