"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  Package,
  History,
  ChevronLeft,
  ChevronRight,
  Gift,
  Edit3,
  Trash2,
} from "lucide-react";

interface Product {
  id: string;
  name: string;
  base_price: number;
  stock: number;
}

interface SampleLog {
  id: string;
  created_at: string;
  description: string;
  transaction_items: {
    qty: number;
    product_id: string;
    product: { name: string; base_price: number } | null;
  }[];
}

export default function SamplePage() {
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

  const [products, setProducts] = useState<Product[]>([]);
  const [sampleHistory, setSampleHistory] = useState<SampleLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [qty, setQty] = useState(1);
  const [description, setDescription] = useState("");
  const [transactionDate, setTransactionDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // SINKRONISASI TANGGAL DEFAULT
  useEffect(() => {
    const monthStr = String(selectedMonth).padStart(2, "0");
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
    setLoading(true);
    try {
      const { data: p } = await supabase
        .from("products")
        .select("*")
        .order("name");
      if (p) setProducts(p as Product[]);

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

      const { data: h } = await supabase
        .from("transactions")
        .select(
          `id, created_at, description, transaction_items (qty, product_id, product:product_id (name, base_price))`,
        )
        .eq("is_sample", true)
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false });

      if (h) setSampleHistory(h as unknown as SampleLog[]);
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedMonth, selectedYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || qty < 1 || !description)
      return toast.error("Lengkapi data!");

    setIsSubmitting(true);
    const toastId = toast.loading(
      editingId ? "Mengupdate..." : "Mencatat Sample...",
    );

    try {
      const product = products.find((p) => p.id === selectedProduct);
      if (!product) return;

      if (editingId) {
        // --- FIX LOGIKA EDIT: NETRALISIR STOK LAMA ---
        const { data: oldItem } = await supabase
          .from("transaction_items")
          .select("qty, product_id")
          .eq("transaction_id", editingId)
          .single();

        if (oldItem) {
          const { data: pOld } = await supabase
            .from("products")
            .select("stock")
            .eq("id", oldItem.product_id)
            .single();
          if (pOld) {
            await supabase
              .from("products")
              .update({ stock: pOld.stock + oldItem.qty })
              .eq("id", oldItem.product_id);
          }
        }

        // UPDATE DATA TRANSAKSI
        await supabase
          .from("transactions")
          .update({
            description,
            created_at: new Date(transactionDate).toISOString(),
          })
          .eq("id", editingId);

        await supabase
          .from("transaction_items")
          .update({ product_id: selectedProduct, qty })
          .eq("transaction_id", editingId);

        // POTONG STOK BARU
        const { data: pNew } = await supabase
          .from("products")
          .select("stock")
          .eq("id", selectedProduct)
          .single();
        if (pNew) {
          await supabase
            .from("products")
            .update({ stock: pNew.stock - qty })
            .eq("id", selectedProduct);
        }
      } else {
        // INSERT BARU
        const { data: trans, error: transError } = await supabase
          .from("transactions")
          .insert([
            {
              mitra_id: null,
              total_amount: 0,
              paid_amount: 0,
              payment_method: "SAMPLE",
              payment_status: "Paid",
              is_sample: true,
              description,
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
            remaining_qty_at_partner: 0,
            price_at_time: 0,
          },
        ]);

        await supabase
          .from("products")
          .update({ stock: product.stock - qty })
          .eq("id", product.id);
      }

      toast.success(editingId ? "Berhasil diupdate!" : "Sample dicatat!", {
        id: toastId,
      });
      setEditingId(null);
      setQty(1);
      setDescription("");
      setSelectedProduct("");
      await fetchData();
    } catch {
      toast.error("Gagal memproses!", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (item: SampleLog) => {
    setEditingId(item.id);
    setSelectedProduct(item.transaction_items[0]?.product_id || "");
    setQty(item.transaction_items[0]?.qty || 1);
    setDescription(item.description);
    setTransactionDate(new Date(item.created_at).toISOString().split("T")[0]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // --- FIX LOGIKA HAPUS: KEMBALIKAN STOK ---
  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "Hapus catatan sample ini? Stok gudang akan otomatis dikembalikan.",
      )
    )
      return;
    const toastId = toast.loading("Menghapus & Mengembalikan Stok...");

    try {
      const { data: items } = await supabase
        .from("transaction_items")
        .select("qty, product_id")
        .eq("transaction_id", id);

      if (items) {
        for (const item of items) {
          const { data: prod } = await supabase
            .from("products")
            .select("stock")
            .eq("id", item.product_id)
            .single();
          if (prod) {
            await supabase
              .from("products")
              .update({ stock: prod.stock + item.qty })
              .eq("id", item.product_id);
          }
        }
      }

      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", id);
      if (!error) {
        toast.success("Catatan dihapus & stok kembali!", { id: toastId });
        fetchData();
      } else throw error;
    } catch {
      toast.error("Gagal hapus!", { id: toastId });
    }
  };

  const totalPages = Math.ceil(sampleHistory.length / itemsPerPage);
  const currentItems = sampleHistory.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
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

  if (loading)
    return (
      <div className="p-20 text-center font-black animate-pulse text-green-800 uppercase italic">
        Sync Data {months[selectedMonth - 1]}...
      </div>
    );

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans text-gray-900">
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <Gift size={36} className="text-green-900" />
          <h1 className="text-4xl font-black text-green-900 italic uppercase tracking-tighter">
            Pengeluaran Sample Pusat
          </h1>
        </div>
        <div className="bg-orange-50 px-4 py-2 rounded-2xl border border-orange-100 flex items-center gap-2">
          <History size={16} className="text-orange-600" />
          <span className="text-[10px] font-black uppercase text-orange-600 tracking-widest">
            Periode: {months[selectedMonth - 1]} {selectedYear}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-4">
          <form
            onSubmit={handleSubmit}
            className={`bg-white p-8 rounded-[40px] shadow-2xl border-2 space-y-6 sticky top-8 transition-all ${editingId ? "border-orange-400" : "border-gray-50"}`}
          >
            <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <Package size={14} />{" "}
              {editingId ? "EDIT DATA SAMPLE" : "INPUT BARANG KELUAR"}
            </h2>
            <div>
              <label className="text-[10px] font-black uppercase text-gray-500 mb-1 block ml-1">
                Produk
              </label>
              <select
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">-- Produk --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Stok: {p.stock})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500 mb-1 block ml-1">
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
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500 mb-1 block ml-1">
                  Tanggal
                </label>
                <input
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  min={`${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`}
                  max={`${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${new Date(selectedYear, selectedMonth, 0).getDate()}`}
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-gray-500 mb-1 block ml-1">
                Tujuan
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold h-24 outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Misal: Sample Promosi Toko A"
              />
            </div>
            <div className="flex flex-col gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-5 rounded-2xl font-black text-white uppercase tracking-widest shadow-lg transition-all ${editingId ? "bg-orange-500 hover:bg-orange-600" : "bg-green-800 hover:bg-green-900"}`}
              >
                {isSubmitting
                  ? "MEMPROSES..."
                  : editingId
                    ? "🚀 UPDATE PERUBAHAN"
                    : "🚀 KONFIRMASI SAMPLE"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setQty(1);
                    setDescription("");
                    setSelectedProduct("");
                  }}
                  className="text-[10px] font-black text-gray-400 uppercase hover:text-red-500"
                >
                  Batal Edit
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="lg:col-span-8">
          <div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <History size={18} className="text-gray-400" />
                <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Riwayat Sample
                </h2>
              </div>
              <span className="text-[9px] font-black text-green-700 bg-green-50 px-3 py-1 rounded-full uppercase">
                {sampleHistory.length} Transaksi
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-[9px] font-black text-gray-400 uppercase tracking-widest border-b bg-gray-50/30">
                  <tr>
                    <th className="p-6">Waktu & Produk</th>
                    <th className="p-6">Harga Satuan</th>
                    <th className="p-6">Tujuan</th>
                    <th className="p-6 text-center">Qty</th>
                    <th className="p-6 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {currentItems.length > 0 ? (
                    currentItems.map((item) => {
                      const prod = item.transaction_items[0]?.product;
                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-gray-50/50 transition-colors group"
                        >
                          <td className="p-6">
                            <div className="text-[10px] font-bold text-gray-300">
                              {new Date(item.created_at).toLocaleDateString(
                                "id-ID",
                              )}
                            </div>
                            <div className="font-black text-green-900 uppercase italic text-xs">
                              {prod?.name || "N/A"}
                            </div>
                          </td>
                          <td className="p-6 font-mono font-bold text-gray-400 text-xs italic">
                            Rp {prod?.base_price.toLocaleString("id-ID")}
                          </td>
                          <td className="p-6 text-[11px] font-bold text-gray-500 italic">
                            &quot;{item.description}&quot;
                          </td>
                          <td className="p-6 text-center font-black text-green-700 text-lg">
                            {item.transaction_items[0]?.qty}
                          </td>
                          <td className="p-6">
                            <div className="flex justify-center gap-2">
                              <button
                                onClick={() => handleEdit(item)}
                                className="p-2 bg-orange-50 text-orange-500 rounded-lg hover:bg-orange-500 hover:text-white transition-all"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={() => handleDelete(item.id)}
                                className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-20 text-center text-gray-300 italic font-bold"
                      >
                        Tidak ada data sample di periode ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="p-6 flex justify-between items-center bg-gray-50/30 border-t">
                <span className="text-[10px] font-black uppercase text-gray-400">
                  Hal {currentPage} dari {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 border rounded-xl hover:bg-white disabled:opacity-20"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="p-2 border rounded-xl hover:bg-white disabled:opacity-20"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
