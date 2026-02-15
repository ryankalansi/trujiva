"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";

import { createClient } from "@/lib/supabase";

import toast from "react-hot-toast";

import {
  Package,
  Trash2,
  Power,
  PowerOff,
  ArrowUpCircle,
  X,
} from "lucide-react";

interface Product {
  id: string;

  name: string;

  base_price: number;

  initial_stock: number;

  stock: number;

  is_active: boolean;
}

export default function ManagementProduk() {
  const supabase = useMemo(() => createClient(), []);

  const formRef = useRef<HTMLFormElement>(null);

  const [products, setProducts] = useState<Product[]>([]);

  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");

  const [price, setPrice] = useState<string>("");

  const [stock, setStock] = useState<string>("");

  const [restockItem, setRestockItem] = useState<Product | null>(null);

  const [restockQty, setRestockQty] = useState<number>(0);

  const fetchProductsData = useCallback(async () => {
    const { data } = await supabase.from("products").select("*").order("name");

    if (data) setProducts(data as Product[]);
  }, [supabase]);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      if (isMounted) {
        await fetchProductsData();

        setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [fetchProductsData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name) return toast.error("Nama wajib diisi!");

    const toastId = toast.loading("Processing...");

    const numericPrice = Number(price.replace(/\./g, "")) || 0;

    const numericStock = Number(stock) || 0;

    const payload = {
      name,

      base_price: numericPrice,

      initial_stock: numericStock,

      stock: numericStock,
    };

    const { error } = editingId
      ? await supabase.from("products").update(payload).eq("id", editingId)
      : await supabase

          .from("products")

          .insert([{ ...payload, is_active: true }]);

    if (!error) {
      toast.success("Data disimpan!", { id: toastId });

      setEditingId(null);

      setName("");

      setPrice("");

      setStock("");

      await fetchProductsData();
    } else {
      toast.error("Gagal simpan data!", { id: toastId });
    }
  };

  const handleActionDelete = async (product: Product) => {
    if (confirm(`Hapus permanen ${product.name}?`)) {
      const toastId = toast.loading("Menghapus...");

      const { error } = await supabase

        .from("products")

        .delete()

        .eq("id", product.id);

      if (!error) {
        toast.success("Dihapus permanen!", { id: toastId });

        await fetchProductsData();
      } else {
        await supabase

          .from("products")

          .update({ is_active: false })

          .eq("id", product.id);

        toast.success("Produk memiliki riwayat, dialihkan ke NON-AKTIF.", {
          id: toastId,
        });

        await fetchProductsData();
      }
    }
  };

  const toggleStatus = async (product: Product) => {
    const toastId = toast.loading("Updating status...");

    const { error } = await supabase

      .from("products")

      .update({ is_active: !product.is_active })

      .eq("id", product.id);

    if (!error) {
      toast.success(`Produk ${!product.is_active ? "AKTIF" : "OFF"}`, {
        id: toastId,
      });

      await fetchProductsData();
    } else {
      toast.error("Gagal ubah status!", { id: toastId });
    }
  };

  const handleRestock = async () => {
    if (!restockItem || restockQty <= 0) return toast.error("Qty tidak valid!");
    const toastId = toast.loading("Restocking...");

    try {
      const { error } = await supabase
        .from("products")
        .update({
          stock: restockItem.stock + restockQty,
          initial_stock: restockItem.initial_stock + restockQty,
        })
        .eq("id", restockItem.id);

      if (error) throw error;

      toast.success("Stok ditambah!", { id: toastId });
      setRestockItem(null);
      setRestockQty(0);
      await fetchProductsData();
    } catch {
      toast.error("Gagal restock!", { id: toastId });
    }
  };

  if (loading)
    return (
      <div className="p-8 text-center font-black animate-pulse text-green-800 uppercase">
        Sync Gudang...
      </div>
    );

  return (
    <div className="p-8 max-w-6xl mx-auto font-sans text-gray-900">
      <header className="mb-10 flex items-center gap-3">
        <Package size={36} className="text-green-900" />

        <h1 className="text-4xl font-black text-green-900 uppercase italic tracking-tighter">
          Manajemen Produk
        </h1>
      </header>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className={`bg-white p-8 rounded-[40px] shadow-2xl border-2 mb-12 grid grid-cols-1 md:grid-cols-4 gap-6 items-end transition-all ${editingId ? "border-orange-400" : "border-gray-50"}`}
      >
        <div>
          <label className="text-[10px] font-black uppercase text-gray-400 block mb-2">
            Nama Produk
          </label>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold"
            placeholder="Nama..."
          />
        </div>

        <div>
          <label className="text-[10px] font-black uppercase text-gray-400 block mb-2">
            Harga Jual (Rp)
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
            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold"
            placeholder="0"
          />
        </div>

        <div>
          <label className="text-[10px] font-black uppercase text-gray-400 block mb-2">
            Stok Awal
          </label>

          <input
            type="text"
            value={stock}
            onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))}
            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold"
            placeholder="0"
          />
        </div>

        <button
          type="submit"
          className={`p-4 h-[58px] rounded-2xl font-black text-white uppercase text-[10px] shadow-lg ${editingId ? "bg-orange-500" : "bg-green-800"}`}
        >
          {editingId ? "UPDATE DATA" : "TAMBAH PRODUK"}
        </button>
      </form>

      <div className="bg-white rounded-[35px] shadow-2xl overflow-hidden border border-gray-100">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-widest border-b">
            <tr>
              <th className="p-8">Produk</th>

              <th className="p-8 text-right">Harga</th>

              <th className="p-8 text-center">Stok</th>

              <th className="p-8 text-center">Aksi</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-50">
            {products.map((p) => (
              <tr
                key={p.id}
                className={`hover:bg-green-50/10 transition-colors ${!p.is_active ? "bg-gray-50/50" : ""}`}
              >
                <td className="p-8 font-black uppercase italic text-gray-700">
                  {p.name}{" "}
                  {!p.is_active && (
                    <span className="text-[8px] bg-gray-200 px-2 py-1 rounded-md ml-2 not-italic text-gray-500">
                      OFF
                    </span>
                  )}
                </td>

                <td className="p-8 font-mono font-black text-right text-green-700">
                  Rp {p.base_price.toLocaleString("id-ID")}
                </td>

                <td className="p-8 text-center font-black">
                  <span className="text-green-700 text-xl">{p.stock}</span> /{" "}
                  <span className="text-gray-400">{p.initial_stock}</span>
                </td>

                <td className="p-8 text-center">
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={() => toggleStatus(p)}
                      className={`p-2 rounded-xl text-white ${p.is_active ? "bg-blue-500" : "bg-gray-400"} shadow-sm active:scale-95 transition-all`}
                    >
                      {p.is_active ? (
                        <Power size={14} />
                      ) : (
                        <PowerOff size={14} />
                      )}
                    </button>

                    <button
                      onClick={() => setRestockItem(p)}
                      className="p-2 bg-green-50 text-green-700 rounded-xl font-black text-[9px] flex items-center gap-1 hover:bg-green-700 hover:text-white transition-all"
                    >
                      <ArrowUpCircle size={14} /> RESTOCK
                    </button>

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

                        formRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }}
                      className="p-2 bg-orange-50 text-orange-500 rounded-xl font-black text-[9px]"
                    >
                      EDIT
                    </button>

                    <button
                      onClick={() => handleActionDelete(p)}
                      className="p-2 bg-red-50 text-red-500 rounded-xl font-black text-[9px] hover:bg-red-500 hover:text-white transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {restockItem && (
        <div className="fixed inset-0 bg-green-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] shadow-2xl max-w-sm w-full p-8 relative border-4 border-green-800">
            <button
              onClick={() => setRestockItem(null)}
              className="absolute top-6 right-6 text-gray-400 hover:text-red-500"
            >
              <X />
            </button>

            <div className="text-center mb-6">
              <ArrowUpCircle
                size={48}
                className="mx-auto text-green-800 mb-2"
              />

              <h2 className="font-black text-2xl text-green-900 uppercase italic">
                Restock {restockItem.name}
              </h2>
            </div>

            <div className="space-y-4">
              <input
                type="number"
                autoFocus
                value={restockQty}
                onChange={(e) => setRestockQty(Number(e.target.value))}
                className="w-full p-5 bg-gray-50 border-2 border-gray-100 rounded-2xl font-black text-2xl text-center text-green-800 outline-none focus:border-green-800"
                placeholder="0"
              />

              <button
                onClick={handleRestock}
                className="w-full bg-green-800 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all"
              >
                KONFIRMASI RESTOCK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
