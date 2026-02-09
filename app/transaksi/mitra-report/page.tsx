"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { ClipboardList } from "lucide-react";
import toast from "react-hot-toast";

interface Mitra {
  id: string;
  full_name: string;
  current_tier: string;
}
interface Product {
  id: string;
  name: string;
  base_price: number;
}
interface PartnerReport {
  id: string;
  qty: number;
  selling_price: number;
  created_at: string;
  mitra: { full_name: string; current_tier: string } | null;
  product: { name: string } | null;
}
interface StockBatch {
  id: string;
  transaction_id: string;
  remaining_qty_at_partner: number;
  price_at_time: number;
  transactions: {
    mitra_id: string;
    total_amount: number;
    paid_amount: number;
  } | null;
}

export default function LaporanPenjualanMitra() {
  const supabase = useMemo(() => createClient(), []);
  const [reports, setReports] = useState<PartnerReport[]>([]);
  const [mitraList, setMitraList] = useState<Mitra[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMitra, setSelectedMitra] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [qtyToSell, setQtyToSell] = useState(1);
  const [totalOmzetInput, setTotalOmzetInput] = useState(0);

  const fetchReports = useCallback(async () => {
    const { data } = await supabase
      .from("partner_reports")
      .select(
        `id, qty, selling_price, created_at, mitra:mitra_id(full_name, current_tier), product:product_id(name)`,
      )
      .order("created_at", { ascending: false });
    if (data) setReports(data as unknown as PartnerReport[]);
  }, [supabase]);

  useEffect(() => {
    async function init() {
      const [m, p] = await Promise.all([
        supabase.from("mitra").select("*").order("full_name"),
        supabase.from("products").select("*").order("name"),
      ]);
      if (m.data) setMitraList(m.data as Mitra[]);
      if (p.data) setProducts(p.data as Product[]);
      await fetchReports();
      setLoading(false);
    }
    init();
  }, [supabase, fetchReports]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalOmzetInput <= 0 || !selectedMitra || !selectedProduct)
      return toast.error("Data tidak lengkap!");
    const toastId = toast.loading("Sinkronisasi...");

    try {
      const { data: rawStock } = await supabase
        .from("transaction_items")
        .select(
          `id, transaction_id, remaining_qty_at_partner, price_at_time, transactions!inner(mitra_id, total_amount, paid_amount)`,
        )
        .eq("product_id", selectedProduct)
        .eq("transactions.mitra_id", selectedMitra)
        .gt("remaining_qty_at_partner", 0)
        .order("id", { ascending: true });

      const stockItems = rawStock as unknown as StockBatch[];
      if (!stockItems || stockItems.length === 0) {
        toast.dismiss(toastId);
        return toast.error("Stok mitra kosong!");
      }

      const productObj = products.find((p) => p.id === selectedProduct);
      if (!productObj) return;

      let remainingToProcess = qtyToSell;
      let totalModalCalculated = 0;

      for (const item of stockItems) {
        if (remainingToProcess <= 0) break;
        const takeQty = Math.min(
          item.remaining_qty_at_partner,
          remainingToProcess,
        );
        const subTotalModal = takeQty * item.price_at_time;
        totalModalCalculated += subTotalModal;

        await supabase
          .from("transaction_items")
          .update({
            remaining_qty_at_partner: item.remaining_qty_at_partner - takeQty,
          })
          .eq("id", item.id);

        if (item.transactions) {
          const amountToShift = Math.min(
            item.transactions.total_amount,
            subTotalModal,
          );
          const newTotal = item.transactions.total_amount - amountToShift;
          const newPaid = item.transactions.paid_amount + amountToShift;
          await supabase
            .from("transactions")
            .update({
              total_amount: Math.round(newTotal),
              paid_amount: Math.round(newPaid),
              payment_status: newTotal <= 1 ? "Paid" : "Unpaid",
            })
            .eq("id", item.transaction_id);
        }
        remainingToProcess -= takeQty;
      }

      const pricePerItem = totalOmzetInput / qtyToSell;
      const commissionPerItem = pricePerItem - totalModalCalculated / qtyToSell;

      const { error: insertError } = await supabase
        .from("partner_reports")
        .insert([
          {
            mitra_id: selectedMitra,
            product_id: selectedProduct,
            qty: qtyToSell,
            base_price_at_time: productObj.base_price,
            selling_price: pricePerItem,
            commission_rate: commissionPerItem,
            total_omzet_value: totalOmzetInput,
            is_commission_paid: false,
          },
        ]);

      if (insertError) throw insertError;
      toast.success("Laporan berhasil!", { id: toastId });
      setQtyToSell(1);
      setTotalOmzetInput(0);
      await fetchReports();
    } catch {
      toast.error("Gagal menyimpan laporan!", { id: toastId });
    }
  };

  if (loading)
    return (
      <div className="p-20 text-center font-black animate-pulse text-green-800 uppercase italic">
        Sync Laporan...
      </div>
    );

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans text-gray-900">
      <header className="mb-10 text-center">
        <h1 className="text-4xl font-black text-green-900 italic uppercase tracking-tighter flex justify-center items-center gap-3">
          <ClipboardList size={40} /> Laporan Jualan Mitra
        </h1>
      </header>
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-[40px] shadow-2xl border border-gray-100 mb-12 grid grid-cols-1 md:grid-cols-12 gap-6 items-end"
      >
        <div className="md:col-span-3">
          <label className="text-[10px] font-black uppercase text-gray-500 mb-2 ml-1">
            Mitra
          </label>
          <select
            value={selectedMitra}
            onChange={(e) => setSelectedMitra(e.target.value)}
            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold"
          >
            <option value="">-- Pilih --</option>
            {mitraList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-3">
          <label className="text-[10px] font-black uppercase text-gray-500 mb-2 ml-1">
            Produk
          </label>
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold"
          >
            <option value="">-- Pilih --</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-1">
          <label className="text-[10px] font-black uppercase text-gray-500 mb-2 text-center">
            Qty
          </label>
          <input
            type="number"
            value={qtyToSell}
            onChange={(e) => setQtyToSell(Number(e.target.value))}
            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-black text-center"
            min="1"
          />
        </div>
        <div className="md:col-span-3">
          <label className="text-[10px] font-black uppercase text-gray-500 mb-2 ml-1">
            Total Penjualan (Rp)
          </label>
          <input
            type="text"
            value={totalOmzetInput.toLocaleString("id-ID")}
            onChange={(e) =>
              setTotalOmzetInput(Number(e.target.value.replace(/\D/g, "")))
            }
            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold"
          />
        </div>
        <button
          type="submit"
          className="md:col-span-2 bg-green-800 text-white p-4 rounded-2xl font-black uppercase shadow-lg hover:bg-green-900 cursor-pointer"
        >
          LAPORKAN
        </button>
      </form>
      <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-gray-100">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase border-b">
            <tr>
              <th className="p-8">No</th>
              <th className="p-8">Waktu</th>
              <th className="p-8">Mitra</th>
              <th className="p-8 text-center">Qty</th>
              <th className="p-8 text-right">Total Penjualan</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {reports.map((r, idx) => (
              <tr key={r.id}>
                <td className="p-8">{idx + 1}</td>
                <td className="p-8 font-mono text-[10px]">
                  {new Date(r.created_at).toLocaleString("id-ID")}
                </td>
                <td className="p-8 font-bold">{r.mitra?.full_name}</td>
                <td className="p-8 text-center font-black">{r.qty}</td>
                <td className="p-8 text-right font-black">
                  Rp {(r.selling_price * r.qty).toLocaleString("id-ID")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
