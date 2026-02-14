"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation"; // Tambahkan useSearchParams
import toast from "react-hot-toast";
import { Calendar, History } from "lucide-react";

interface Product {
  id: string;
  name: string;
  base_price: number;
  stock: number;
}
interface Mitra {
  id: string;
  full_name: string;
  current_tier: string;
  is_rp: boolean;
}
type PaymentMethod = "QRIS" | "Transfer" | "Piutang";

export default function TransaksiPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();

  // --- 1. LOGIKA PERIODE GLOBAL ---
  const selectedMonth = useMemo(
    () => Number(searchParams.get("month")) || new Date().getMonth() + 1,
    [searchParams],
  );

  const selectedYear = useMemo(
    () => Number(searchParams.get("year")) || new Date().getFullYear(),
    [searchParams],
  );

  const [products, setProducts] = useState<Product[]>([]);
  const [mitra, setMitra] = useState<Mitra[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMitra, setSelectedMitra] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [qty, setQty] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("QRIS");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- 2. SINKRONISASI TANGGAL DEFAULT ---
  // Kita set default tanggal ke tanggal 1 di bulan yang dipilih di Dashboard
  const [transactionDate, setTransactionDate] = useState("");

  useEffect(() => {
    const monthStr = String(selectedMonth).padStart(2, "0");
    // Jika bulan yang dipilih adalah bulan sekarang, pakai tanggal hari ini.
    // Jika bukan, pakai tanggal 1 di bulan tersebut.
    const today = new Date();
    if (
      selectedMonth === today.getMonth() + 1 &&
      selectedYear === today.getFullYear()
    ) {
      setTransactionDate(today.toISOString().split("T")[0]);
    } else {
      setTransactionDate(`${selectedYear}-${monthStr}-01`);
    }
  }, [selectedMonth, selectedYear]);

  const fetchData = useCallback(async () => {
    try {
      const { data: p } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("name");

      const { data: m } = await supabase
        .from("mitra")
        .select("*")
        .order("full_name");

      if (p) setProducts(p as Product[]);
      if (m) setMitra(m as Mitra[]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMitra || !selectedProduct || qty < 1)
      return toast.error("Lengkapi data!");

    setIsSubmitting(true);
    const toastId = toast.loading("Memproses...");

    try {
      const product = products.find((p) => p.id === selectedProduct);
      const mTerpilih = mitra.find((m) => m.id === selectedMitra);
      if (!product || !mTerpilih) return;

      const { data: history } = await supabase
        .from("transaction_items")
        .select(`qty, transactions!inner(mitra_id)`)
        .eq("transactions.mitra_id", selectedMitra);

      const totalQtyLama =
        history?.reduce((acc, curr) => acc + curr.qty, 0) || 0;
      const totalAkumulasiBruto = (totalQtyLama + qty) * product.base_price;

      let newTier = mTerpilih.current_tier;
      if (totalAkumulasiBruto >= 100000000) newTier = "Distributor";
      else if (totalAkumulasiBruto >= 25000000) newTier = "Agen";
      else if (totalAkumulasiBruto >= 5000000) newTier = "Sub-Agen";
      else if (totalAkumulasiBruto >= 500000) newTier = "Reseller";
      if (mTerpilih.is_rp && newTier === "Member") newTier = "Reseller";

      await supabase
        .from("mitra")
        .update({ current_tier: newTier })
        .eq("id", selectedMitra);

      const rates: Record<string, number> = {
        "Member": 0,
        "Reseller": 0.15,
        "Sub-Agen": 0.25,
        "Agen": 0.35,
        "Distributor": 0.45,
      };
      const netAmount = qty * product.base_price * (1 - rates[newTier]);
      const isPiutang = paymentMethod === "Piutang";

      const { data: trans, error: transError } = await supabase
        .from("transactions")
        .insert([
          {
            mitra_id: selectedMitra,
            total_amount: Math.round(isPiutang ? netAmount : 0),
            paid_amount: Math.round(isPiutang ? 0 : netAmount),
            payment_method: paymentMethod,
            payment_status: isPiutang ? "Unpaid" : "Paid",
            created_at: new Date(
              `${transactionDate}T${new Date().toTimeString().split(" ")[0]}`,
            ).toISOString(),
          },
        ])
        .select()
        .single();

      if (transError) throw transError;

      await supabase.from("transaction_items").insert([
        {
          transaction_id: trans.id,
          product_id: selectedProduct,
          qty,
          remaining_qty_at_partner: qty,
          price_at_time: product.base_price * (1 - rates[newTier]),
        },
      ]);

      await supabase
        .from("products")
        .update({ stock: product.stock - qty })
        .eq("id", product.id);

      toast.success(`${mTerpilih.full_name} sah jadi ${newTier}!`, {
        id: toastId,
      });
      router.refresh();
      await fetchData();
      setSelectedMitra("");
      setSelectedProduct("");
      setQty(1);
    } catch {
      toast.error("Transaksi gagal!", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading)
    return (
      <div className="p-20 text-center font-black animate-pulse text-green-800 uppercase italic">
        Sync Data...
      </div>
    );

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

  return (
    <div className="p-8 max-w-2xl mx-auto font-sans text-gray-900">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-black text-green-900 italic uppercase tracking-tighter">
          Input Pemesanan Mitra
        </h1>
        {/* Indikator agar admin tidak salah input bulan */}
        <div className="mt-2 flex justify-center">
          <div className="bg-orange-50 px-4 py-1.5 rounded-full border border-orange-100 flex items-center gap-2">
            <History size={12} className="text-orange-600" />
            <span className="text-[9px] font-black uppercase text-orange-600 tracking-widest">
              Mode Input: {months[selectedMonth - 1]} {selectedYear}
            </span>
          </div>
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        className="bg-white p-10 rounded-[40px] shadow-2xl border border-gray-100 space-y-6"
      >
        <div className="bg-orange-50/50 p-4 rounded-2xl border border-orange-100 mb-4">
          <label className="text-[10px] font-black uppercase text-orange-600 mb-2 tracking-widest ml-1 flex items-center gap-2">
            <Calendar size={12} /> Tanggal Transaksi
          </label>
          <input
            type="date"
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
            // Membatasi input agar hanya bisa di bulan yang dipilih
            min={`${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`}
            max={`${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${new Date(selectedYear, selectedMonth, 0).getDate()}`}
            className="w-full p-3 bg-white border border-orange-200 rounded-xl font-bold text-orange-900 outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
          />
        </div>

        <div>
          <label className="text-[10px] font-black uppercase text-gray-500 mb-2 tracking-widest ml-1">
            Nama Mitra
          </label>
          <select
            value={selectedMitra}
            onChange={(e) => setSelectedMitra(e.target.value)}
            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-green-500 cursor-pointer"
          >
            <option value="">-- Pilih Mitra --</option>
            {mitra.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name} ({m.current_tier}) {m.is_rp && "[RP]"}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="text-[10px] font-black uppercase text-gray-500 mb-2 tracking-widest ml-1">
              Produk
            </label>
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold"
            >
              <option value="">-- Produk --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id} disabled={p.stock <= 0}>
                  {p.name} ({p.stock})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-gray-500 mb-2 text-center tracking-widest">
              Qty
            </label>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-black text-center"
              min="1"
            />
          </div>
        </div>

        <div className="flex gap-4 justify-center bg-gray-50/50 p-4 rounded-2xl border border-dashed border-gray-200">
          {(["QRIS", "Transfer", "Piutang"] as PaymentMethod[]).map((m) => (
            <label
              key={m}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <input
                type="radio"
                name="pay"
                value={m}
                checked={paymentMethod === m}
                onChange={() => setPaymentMethod(m)}
                className="w-4 h-4 accent-green-600"
              />
              <span
                className={`text-[10px] font-black uppercase tracking-widest transition-colors ${paymentMethod === m ? "text-green-700" : "text-gray-400 group-hover:text-gray-600"}`}
              >
                {m}
              </span>
            </label>
          ))}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-5 rounded-2xl font-black text-white bg-green-800 uppercase tracking-widest shadow-lg active:scale-95 transition-all hover:bg-green-900 disabled:opacity-50"
        >
          {isSubmitting ? "MEMPROSES..." : "🚀 SELESAIKAN TRANSAKSI"}
        </button>
      </form>
    </div>
  );
}
