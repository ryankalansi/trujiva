"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import toast from "react-hot-toast";

interface Product {
  id: string;
  name: string;
  base_price: number;
  initial_stock: number;
  stock: number;
}

export default function ManagementProduk() {
  const supabase = useMemo(() => createClient(), []);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState<string>("");
  const [stock, setStock] = useState<string>("");

  const fetchProductsData = useCallback(async () => {
    const { data } = await supabase.from("products").select("*").order("name");
    if (data) setProducts(data as Product[]);
  }, [supabase]);

  useEffect(() => {
    async function loadData() {
      await fetchProductsData();
      setLoading(false);
    }
    loadData();
  }, [fetchProductsData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return toast.error("Nama wajib diisi!");
    const toastId = toast.loading("Processing...");
    const numericPrice = Number(price.replace(/\./g, "")) || 0;
    const numericStock = Number(stock) || 0;

    const { error } = editingId
      ? await supabase
          .from("products")
          .update({
            name,
            base_price: numericPrice,
            initial_stock: numericStock,
            stock: numericStock,
          })
          .eq("id", editingId)
      : await supabase.from("products").insert([
          {
            name,
            base_price: numericPrice,
            initial_stock: numericStock,
            stock: numericStock,
          },
        ]);

    if (!error) {
      toast.success("Berhasil!", { id: toastId });
      setEditingId(null);
      setName("");
      setPrice("");
      setStock("");
      await fetchProductsData();
    } else {
      toast.error("Gagal!", { id: toastId });
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Hapus produk?")) {
      const toastId = toast.loading("Menghapus...");
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (!error) {
        toast.success("Terhapus!", { id: toastId });
        await fetchProductsData();
      } else {
        toast.error("Gagal hapus!", { id: toastId });
      }
    }
  };

  if (loading)
    return (
      <div className="p-8 text-center font-black animate-pulse text-green-800 italic uppercase">
        Sync Gudang...
      </div>
    );

  return (
    <div className="p-8 max-w-6xl mx-auto font-sans">
      <h1 className="text-4xl font-black text-green-900 uppercase italic mb-10 tracking-tighter">
        Manajemen Produk
      </h1>

      {/* Form Input/Edit */}
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-[40px] shadow-2xl border border-gray-100 mb-12 grid grid-cols-1 md:grid-cols-4 gap-6 items-end"
      >
        <div>
          <label className="text-[10px] font-black uppercase text-gray-400 block mb-2 ml-1">
            Nama Produk
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-green-500"
            placeholder="Contoh: Stevia 10ml"
          />
        </div>
        <div>
          <label className="text-[10px] font-black uppercase text-gray-400 block mb-2 ml-1">
            Harga Base (Rp)
          </label>
          <input
            type="text"
            value={price}
            onChange={(e) =>
              setPrice(
                e.target.value
                  .replace(/\D/g, "")
                  .replace(/\B(?=(\d{3})+(?!\d))/g, "."),
              )
            }
            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-green-500"
            placeholder="0"
          />
        </div>
        <div>
          <label className="text-[10px] font-black uppercase text-gray-400 block mb-2 ml-1">
            Stok Awal
          </label>
          <input
            type="text"
            value={stock}
            onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))}
            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-green-500"
            placeholder="0"
          />
        </div>
        <button
          type="submit"
          className={`p-4 rounded-2xl font-black text-white uppercase tracking-widest text-xs shadow-lg transition-all active:scale-95 ${editingId ? "bg-orange-500 hover:bg-orange-600" : "bg-green-800 hover:bg-green-900"}`}
        >
          {editingId ? "UPDATE PRODUK" : "SUBMIT PRODUK"}
        </button>
      </form>

      {/* Tabel Produk */}
      <div className="bg-white rounded-[35px] shadow-2xl overflow-hidden border border-gray-100">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-[10px] font-black uppercase border-b border-gray-100 tracking-widest">
            <tr>
              <th className="p-8">Nama Produk</th>
              <th className="p-8 text-right">Harga Base</th>
              <th className="p-8 text-center">Stok (Sisa/Awal)</th>
              <th className="p-8 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-green-50/20 transition-colors">
                <td className="p-8 font-black uppercase italic text-gray-700">
                  {p.name}
                </td>
                <td className="p-8 font-mono font-bold text-right text-gray-600">
                  Rp {p.base_price.toLocaleString("id-ID")}
                </td>
                <td className="p-8 text-center font-black">
                  <span className="text-green-700 text-lg">{p.stock}</span>
                  <span className="text-gray-300 text-sm">
                    {" "}
                    / {p.initial_stock}
                  </span>
                </td>
                <td className="p-8 text-center">
                  <div className="flex justify-center gap-4">
                    <button
                      onClick={() => {
                        setEditingId(p.id);
                        setName(p.name);
                        setPrice(
                          p.base_price
                            .toString()
                            .replace(/\B(?=(\d{3})+(?!\d))/g, "."),
                        );
                        setStock(p.stock.toString());
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="text-orange-500 font-black text-[10px] uppercase hover:underline"
                    >
                      EDIT
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-red-500 font-black text-[10px] uppercase hover:underline"
                    >
                      HAPUS
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
