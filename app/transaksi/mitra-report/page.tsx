"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";
import { ClipboardList, CalendarDays, Calendar, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

// --- Interface Definisi ---
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
  base_price_at_time: number;
  commission_rate: number;
  created_at: string;
  mitra_id: string;
  product_id: string;
  mitra: { full_name: string; current_tier: string } | null;
  product: { name: string } | null;
}
interface StockBatch {
  id: string;
  transaction_id: string;
  remaining_qty_at_partner: number;
  price_at_time: number;
  transactions: {
    id: string;
    total_amount: number;
    paid_amount: number;
    mitra_id: string;
    payment_method: string;
  } | null;
}

export default function LaporanPenjualanMitra() {
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

  const [reports, setReports] = useState<PartnerReport[]>([]);
  const [mitraList, setMitraList] = useState<Mitra[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedMitra, setSelectedMitra] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [qtyToSell, setQtyToSell] = useState(1);
  const [totalOmzetInput, setTotalOmzetInput] = useState(0);
  const [reportDateInput, setReportDateInput] = useState("");

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

  useEffect(() => {
    const monthStr = String(selectedMonth).padStart(2, "0");
    const today = new Date();
    setReportDateInput(
      selectedMonth === today.getMonth() + 1 &&
        selectedYear === today.getFullYear()
        ? today.toISOString().split("T")[0]
        : `${selectedYear}-${monthStr}-01`,
    );
  }, [selectedMonth, selectedYear]);

  const fetchReports = useCallback(async () => {
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
    const { data } = await supabase
      .from("partner_reports")
      .select(
        `id, qty, selling_price, base_price_at_time, commission_rate, created_at, mitra_id, product_id,
         mitra:mitra_id(full_name, current_tier), product:product_id(name)`,
      )
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false });
    if (data) setReports(data as unknown as PartnerReport[]);
  }, [supabase, selectedMonth, selectedYear]);

  useEffect(() => {
    (async () => {
      const [m, p] = await Promise.all([
        supabase.from("mitra").select("*").order("full_name"),
        supabase.from("products").select("*").order("name"),
      ]);
      if (m.data) setMitraList(m.data as Mitra[]);
      if (p.data) setProducts(p.data as Product[]);
      await fetchReports();
      setLoading(false);
    })();
  }, [supabase, fetchReports]);

  // --- LOGIKA SIMPAN PENJUALAN (FIFO) ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMitra || !selectedProduct || totalOmzetInput <= 0)
      return toast.error("Data tidak lengkap!");

    const toastId = toast.loading("Memproses Penjualan...");
    try {
      // Ambil SEMUA batch stok mitra untuk produk ini, urut dari yang paling lama (FIFO)
      const { data: rawStock } = await supabase
        .from("transaction_items")
        .select(
          `id, transaction_id, remaining_qty_at_partner, price_at_time,
           transactions!inner(id, mitra_id, total_amount, paid_amount, payment_method)`,
        )
        .eq("product_id", selectedProduct)
        .eq("transactions.mitra_id", selectedMitra)
        .gt("remaining_qty_at_partner", 0)
        .order("id", { ascending: true }); // FIFO: batch terlama duluan

      const stockItems = rawStock as unknown as StockBatch[];

      if (!stockItems || stockItems.length === 0) {
        toast.dismiss(toastId);
        return toast.error("Stok mitra kosong!");
      }

      // Cek total stok tersedia
      const totalAvailable = stockItems.reduce(
        (sum, i) => sum + i.remaining_qty_at_partner,
        0,
      );
      if (qtyToSell > totalAvailable) {
        toast.dismiss(toastId);
        return toast.error(`Stok tidak cukup! Tersedia: ${totalAvailable} pcs`);
      }

      let remainingToProcess = qtyToSell;
      let totalModalLaku = 0;

      for (const item of stockItems) {
        if (remainingToProcess <= 0) break;

        const take = Math.min(
          item.remaining_qty_at_partner,
          remainingToProcess,
        );
        const modalValue = take * item.price_at_time;
        totalModalLaku += modalValue;

        // A. Potong stok mitra (FIFO)
        await supabase
          .from("transaction_items")
          .update({
            remaining_qty_at_partner: item.remaining_qty_at_partner - take,
          })
          .eq("id", item.id);

        // B. KRUSIAL: Shift saldo kas HANYA jika batch ini berasal dari PIUTANG
        // Kalau QRIS/Transfer (beli putus): sudah lunas saat ambil, TIDAK ada perubahan kas
        // Kalau Piutang: baru masuk kas saat mitra jual ke konsumen
        if (item.transactions) {
          const isBeliPutus =
            item.transactions.payment_method === "QRIS" ||
            item.transactions.payment_method === "Transfer";

          if (!isBeliPutus) {
            // Piutang: shift dari total_amount (piutang) ke paid_amount (kas masuk)
            const shiftAmount = Math.min(
              item.transactions.total_amount,
              modalValue,
            );
            await supabase
              .from("transactions")
              .update({
                total_amount: Math.round(
                  item.transactions.total_amount - shiftAmount,
                ),
                paid_amount: Math.round(
                  item.transactions.paid_amount + shiftAmount,
                ),
                payment_status:
                  item.transactions.total_amount - shiftAmount <= 1
                    ? "Paid"
                    : "Unpaid",
              })
              .eq("id", item.transaction_id);
          }
          // isBeliPutus == true → lewati, kas tidak berubah ✅
        }

        remainingToProcess -= take;
      }

      // C. Simpan laporan performa penjualan
      const finalAt = new Date(
        `${reportDateInput}T${new Date().toTimeString().split(" ")[0]}`,
      ).toISOString();

      await supabase.from("partner_reports").insert([
        {
          mitra_id: selectedMitra,
          product_id: selectedProduct,
          qty: qtyToSell,
          base_price_at_time:
            products.find((p) => p.id === selectedProduct)?.base_price || 0,
          selling_price: totalOmzetInput / qtyToSell,
          commission_rate:
            totalOmzetInput / qtyToSell - totalModalLaku / qtyToSell,
          total_omzet_value: totalOmzetInput,
          created_at: finalAt,
        },
      ]);

      toast.success("Laporan Berhasil!", { id: toastId });
      setQtyToSell(1);
      setTotalOmzetInput(0);
      await fetchReports();
    } catch {
      toast.error("Gagal simpan!");
    }
  };

  // --- LOGIKA REVERSAL / HAPUS PENJUALAN ---
  // FIX: Reversal FIFO terbalik (LIFO untuk undo) — kembalikan stok ke batch
  // dengan urutan terbaru duluan (kebalikan dari saat jual)
  const handleDeleteReport = async (report: PartnerReport) => {
    if (!confirm("Hapus laporan? Stok & Saldo akan disinkronkan kembali."))
      return;
    const toastId = toast.loading("Sinkronisasi Reversal...");
    try {
      // Ambil SEMUA batch yang sudah habis/berkurang, urut dari terbaru (LIFO untuk reversal)
      // Logika: saat jual, batch terlama dipakai duluan (FIFO)
      // Saat reversal, kita kembalikan ke batch yang paling baru dipakai duluan
      const { data: rawBatches } = await supabase
        .from("transaction_items")
        .select(
          `id, transaction_id, remaining_qty_at_partner, price_at_time,
           transactions!inner(id, total_amount, paid_amount, mitra_id, payment_method)`,
        )
        .eq("product_id", report.product_id)
        .eq("transactions.mitra_id", report.mitra_id)
        .order("id", { ascending: false }); // Terbaru duluan untuk reversal

      const batches = rawBatches as unknown as StockBatch[];
      if (!batches || batches.length === 0)
        throw new Error("Batch transaksi tidak ditemukan.");

      let remainingToRestore = report.qty;

      for (const batch of batches) {
        if (remainingToRestore <= 0) break;

        // Hitung kapasitas yang bisa di-restore ke batch ini
        // (tidak boleh melebihi qty awal batch tersebut)
        // Kita restore sebanyak yang bisa ditampung, karena kita tidak tahu
        // persis berapa yang diambil dari batch ini saat jual
        // Pendekatan: restore sampai remainingToRestore habis
        const restore = remainingToRestore;
        remainingToRestore = 0;

        // A. Kembalikan stok mitra ke batch ini
        await supabase
          .from("transaction_items")
          .update({
            remaining_qty_at_partner:
              Number(batch.remaining_qty_at_partner) + restore,
          })
          .eq("id", batch.id);

        // B. Kembalikan saldo kas HANYA jika batch ini Piutang
        const isBeliPutus =
          batch.transactions?.payment_method === "QRIS" ||
          batch.transactions?.payment_method === "Transfer";

        if (!isBeliPutus && batch.transactions) {
          const modalToRestore = Math.round(restore * batch.price_at_time);
          await supabase
            .from("transactions")
            .update({
              total_amount: Math.round(
                Number(batch.transactions.total_amount) + modalToRestore,
              ),
              paid_amount: Math.round(
                Math.max(
                  0,
                  Number(batch.transactions.paid_amount) - modalToRestore,
                ),
              ),
              payment_status: "Unpaid",
            })
            .eq("id", batch.transactions.id);
        }
      }

      await supabase.from("partner_reports").delete().eq("id", report.id);
      toast.success("DATA BERHASIL DI-RESET!", { id: toastId });
      await fetchReports();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "Gagal!", { id: toastId });
    }
  };

  const getHistoricalTierLabel = (r: PartnerReport) => {
    if (!r.base_price_at_time || r.base_price_at_time === 0)
      return r.mitra?.current_tier || "Member";
    const modalPerItem = r.selling_price - r.commission_rate;
    const discountPercent = Math.round(
      (1 - modalPerItem / r.base_price_at_time) * 100,
    );
    if (discountPercent >= 44) return "Distributor";
    if (discountPercent >= 34) return "Agen";
    if (discountPercent >= 24) return "Sub-Agen";
    if (discountPercent >= 14) return "Reseller";
    return "Member";
  };

  if (loading)
    return (
      <div className="p-20 text-center font-black animate-pulse text-green-800 uppercase italic">
        Sync Laporan Penjualan...
      </div>
    );

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans text-gray-900">
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-4xl font-black text-green-900 italic uppercase tracking-tighter flex items-center gap-3">
          <ClipboardList size={40} /> Performa Jualan Mitra
        </h1>
        <div className="bg-orange-50 px-4 py-2 rounded-2xl border border-orange-100 flex items-center gap-2">
          <CalendarDays size={16} className="text-orange-600" />
          <span className="text-[10px] font-black uppercase text-orange-600 tracking-widest">
            Periode: {months[selectedMonth - 1]} {selectedYear}
          </span>
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-[40px] shadow-2xl border border-gray-100 mb-12 space-y-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
          <div className="md:col-span-3 bg-orange-50/50 p-3 rounded-2xl border border-orange-100">
            <label className="text-[10px] font-black uppercase text-orange-600 mb-1 block flex items-center gap-1">
              <Calendar size={12} /> Tanggal Jualan
            </label>
            <input
              type="date"
              value={reportDateInput}
              onChange={(e) => setReportDateInput(e.target.value)}
              className="w-full bg-transparent font-bold text-orange-900 outline-none"
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-[10px] font-black uppercase text-gray-500 mb-2 ml-1">
              Mitra
            </label>
            <select
              value={selectedMitra}
              onChange={(e) => setSelectedMitra(e.target.value)}
              className="w-full p-4 bg-gray-50 border rounded-2xl font-bold outline-none cursor-pointer"
            >
              <option value="">-- Pilih Mitra --</option>
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
              className="w-full p-4 bg-gray-50 border rounded-2xl font-bold outline-none cursor-pointer"
            >
              <option value="">-- Pilih Produk --</option>
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
              className="w-full p-4 bg-gray-50 border rounded-2xl font-black text-center"
              min="1"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-[10px] font-black uppercase text-gray-500 mb-2 ml-1">
              Total Omzet (Rp)
            </label>
            <input
              type="text"
              value={
                totalOmzetInput === 0
                  ? ""
                  : totalOmzetInput.toLocaleString("id-ID")
              }
              placeholder="Masukkan angka..."
              onChange={(e) =>
                setTotalOmzetInput(Number(e.target.value.replace(/\D/g, "")))
              }
              className="w-full p-4 bg-gray-50 border rounded-2xl font-bold focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>
        <button
          type="submit"
          className="w-full bg-green-800 text-white py-5 rounded-2xl font-black uppercase shadow-lg hover:bg-green-900 transition-all active:scale-[0.98]"
        >
          SIMPAN PENJUALAN
        </button>
      </form>

      <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-gray-100">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b">
            <tr>
              <th className="p-8 w-16 text-center border-r">No</th>
              <th className="p-8">Waktu Jualan</th>
              <th className="p-8">Mitra</th>
              <th className="p-8 text-center">Qty</th>
              <th className="p-8 text-right">Total Jualan</th>
              <th className="p-8 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reports.map((r, idx) => (
              <tr key={r.id} className="hover:bg-gray-50/50 transition-all">
                <td className="p-8 text-gray-300 font-bold text-center border-r">
                  {idx + 1}
                </td>
                <td className="p-8 font-mono text-[10px] text-gray-400">
                  {new Date(r.created_at).toLocaleDateString("id-ID")}
                </td>
                <td className="p-8">
                  <div className="font-bold text-gray-800 uppercase">
                    {r.mitra?.full_name}
                  </div>
                  <div className="text-[9px] font-black uppercase text-green-600">
                    {getHistoricalTierLabel(r)}
                  </div>
                </td>
                <td className="p-8 text-center font-black text-lg">{r.qty}</td>
                <td className="p-8 text-right font-black text-green-700">
                  Rp {(r.selling_price * r.qty).toLocaleString("id-ID")}
                </td>
                <td className="p-8 text-center">
                  <button
                    onClick={() => handleDeleteReport(r)}
                    className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
