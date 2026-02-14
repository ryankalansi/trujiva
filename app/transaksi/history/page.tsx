"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  Search,
  Filter,
  History as HistoryIcon,
  CalendarDays,
  Trash2,
} from "lucide-react";

interface Transaction {
  id: string;
  created_at: string;
  total_amount: number;
  paid_amount: number;
  payment_status: string;
  payment_method: string;
  mitra_id: string;
  mitra: { full_name: string; current_tier: string } | null;
  transaction_items: {
    qty: number;
    product_id: string;
    remaining_qty_at_partner: number;
    price_at_time: number;
    product: { name: string; base_price: number } | null;
  }[];
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

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

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

  // FIX: Fungsi untuk mendeteksi Tier secara historis berdasarkan harga jual saat itu
  const getHistoricalTier = (t: Transaction) => {
    const firstItem = t.transaction_items[0];
    if (!firstItem || !firstItem.product)
      return t.mitra?.current_tier || "Member";

    const basePrice = firstItem.product.base_price;
    const soldPrice = firstItem.price_at_time;

    // Hitung persentase diskon yang diberikan saat transaksi
    const discountPercent = Math.round((1 - soldPrice / basePrice) * 100);

    if (discountPercent >= 44) return "Distributor"; // Diskon 45%
    if (discountPercent >= 34) return "Agen"; // Diskon 35%
    if (discountPercent >= 24) return "Sub-Agen"; // Diskon 25%
    if (discountPercent >= 14) return "Reseller"; // Diskon 15%
    return "Member";
  };

  const loadHistory = useCallback(async () => {
    setLoading(true);
    const startOfMonth = new Date(
      selectedYear,
      selectedMonth - 1,
      1,
      0,
      0,
      0,
      0,
    ).toISOString();
    const endOfMonth = new Date(
      selectedYear,
      selectedMonth,
      0,
      23,
      59,
      59,
      999,
    ).toISOString();

    const { data } = await supabase
      .from("transactions")
      .select(
        `
        id, created_at, total_amount, paid_amount, payment_status, payment_method, mitra_id,
        mitra:mitra_id (full_name, current_tier),
        transaction_items (qty, product_id, remaining_qty_at_partner, price_at_time, product:product_id (name, base_price))
      `,
      )
      .eq("is_sample", false)
      .gte("created_at", startOfMonth)
      .lte("created_at", endOfMonth)
      .order("created_at", { ascending: false });

    if (data) setTransactions(data as unknown as Transaction[]);
    setLoading(false);
  }, [supabase, selectedMonth, selectedYear]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (isMounted) await loadHistory();
    })();
    return () => {
      isMounted = false;
    };
  }, [loadHistory]);

  const handleDelete = async (id: string) => {
    if (
      !confirm("Hapus transaksi ini? Stok gudang akan otomatis dikembalikan.")
    )
      return;
    const toastId = toast.loading("Mengembalikan stok & menghapus data...");

    try {
      const { data: items } = await supabase
        .from("transaction_items")
        .select("qty, product_id")
        .eq("transaction_id", id);
      if (items) {
        for (const item of items) {
          const { data: p } = await supabase
            .from("products")
            .select("stock")
            .eq("id", item.product_id)
            .single();
          if (p)
            await supabase
              .from("products")
              .update({ stock: p.stock + item.qty })
              .eq("id", item.product_id);
        }
      }
      await supabase.from("transactions").delete().eq("id", id);
      toast.success("Berhasil dihapus!", { id: toastId });
      loadHistory();
    } catch (err) {
      console.error(err);
      toast.error("Gagal sinkronisasi!", { id: toastId });
    }
  };

  const filteredData = useMemo(() => {
    return transactions.filter((t) => {
      const name = t.mitra?.full_name || "";
      return (
        name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (statusFilter === "All" || t.payment_status === statusFilter)
      );
    });
  }, [transactions, searchTerm, statusFilter]);

  if (loading)
    return (
      <div className="p-8 text-center font-black animate-pulse text-green-800 uppercase italic">
        Sync Arus Kas...
      </div>
    );

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans text-gray-900">
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <HistoryIcon size={36} className="text-green-900" />
          <h1 className="text-4xl font-black text-green-900 italic uppercase tracking-tighter">
            Arus Kas & Stok Mitra
          </h1>
        </div>
        <div className="bg-blue-50 px-4 py-2 rounded-2xl border border-blue-100 flex items-center gap-2">
          <CalendarDays size={16} className="text-blue-600" />
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
            className="w-full p-4 pl-12 bg-white border border-gray-100 rounded-2xl shadow-sm font-bold outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div className="relative">
          <Filter
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300"
            size={18}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full p-4 pl-12 bg-white border border-gray-100 rounded-2xl shadow-sm font-bold outline-none appearance-none cursor-pointer"
          >
            <option value="All">Semua Status</option>
            <option value="Unpaid">Piutang</option>
            <option value="Paid">Lunas</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-gray-100">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b">
            <tr>
              <th className="p-8 border-r text-center w-16">No</th>
              <th className="p-8">Waktu & Mitra</th>
              <th className="p-8">Stok Aktif</th>
              <th className="p-8 text-right bg-green-50/20 border-r">
                Dibayar
              </th>
              <th className="p-8 text-right bg-red-50/10">Piutang</th>
              <th className="p-8 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredData.length > 0 ? (
              filteredData.map((t, idx) => (
                <tr key={t.id} className="hover:bg-green-50/10 transition-all">
                  <td className="p-8 text-center font-bold text-gray-300 border-r">
                    {idx + 1}
                  </td>
                  <td className="p-8">
                    <div className="text-[10px] font-bold text-gray-300 mb-1">
                      {new Date(t.created_at).toLocaleDateString("id-ID")}
                    </div>
                    <div className="font-bold text-gray-800 uppercase">
                      {t.mitra?.full_name}
                    </div>
                    <div className="flex gap-2 mt-2 items-center">
                      {/* FIX: Menggunakan label tier historis */}
                      <span className="text-[9px] font-black bg-blue-600 text-white px-2 py-0.5 rounded-lg shadow-sm">
                        {getHistoricalTier(t)}
                      </span>
                      <span className="text-[9px] font-black uppercase bg-green-50 text-green-700 px-2 py-0.5 rounded-lg border border-green-100">
                        {t.payment_method}
                      </span>
                    </div>
                  </td>
                  <td className="p-8">
                    {t.transaction_items.map((item, i) => (
                      <div
                        key={i}
                        className="text-[10px] font-black text-gray-500 uppercase italic mb-1"
                      >
                        {item.product?.name}: {item.remaining_qty_at_partner}{" "}
                        Pcs
                      </div>
                    ))}
                  </td>
                  <td className="p-8 text-right border-r bg-green-50/20 font-mono font-black text-green-700 italic text-lg">
                    Rp {t.paid_amount.toLocaleString("id-ID")}
                  </td>
                  <td className="p-8 text-right bg-red-50/10 font-mono font-black text-red-600 italic text-lg">
                    Rp {t.total_amount.toLocaleString("id-ID")}
                  </td>
                  <td className="p-8">
                    <div className="flex flex-col items-center gap-3">
                      <span
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase ${t.payment_status === "Paid" ? "bg-green-700 text-white" : "bg-red-50 text-red-500 border border-red-100"}`}
                      >
                        {t.payment_status}
                      </span>
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="p-3 bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="p-20 text-center text-gray-300 italic font-bold uppercase tracking-widest"
                >
                  Tidak ada data di periode ini
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
