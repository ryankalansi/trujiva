"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Wallet,
  Clock,
  Users,
  TrendingUp,
  FileBarChart,
  BarChart3,
  Gift,
  Calendar,
} from "lucide-react";

// --- Interface Definisi ---
interface DashboardStats {
  omzetKotor: number;
  dibayarKePusat: number;
  piutangMitra: number;
  omzetKonsumen: number;
  totalMitra: number;
  biayaSample: number;
}
interface ProductAudit {
  name: string;
  stokRealtime: number;
  kapasitasTotal: number;
  barangKeluar: number;
  sisaStok: number;
  status: string;
}
interface TransactionItemJoin {
  qty: number;
  remaining_qty_at_partner: number;
  price_at_time: number;
  product: { name: string; base_price: number } | null;
  transactions: {
    id: string;
    created_at: string;
    payment_status: string;
    payment_method: string;
    paid_amount: number;
    total_amount: number;
    is_sample: boolean;
    mitra: { id: string; full_name: string; current_tier: string } | null;
  } | null;
}
interface PartnerReportJoin {
  mitra_id: string;
  product_id: string;
  product: { name: string } | null;
  qty: number;
  selling_price: number;
  commission_rate: number;
  created_at: string;
}
interface StatCardUIProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  highlight?: boolean;
  isCurrency?: boolean;
}

export default function ExecutiveDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedMonth = useMemo(
    () => Number(searchParams.get("month")) || new Date().getMonth() + 1,
    [searchParams],
  );
  const selectedYear = useMemo(
    () => Number(searchParams.get("year")) || new Date().getFullYear(),
    [searchParams],
  );

  const [stats, setStats] = useState<DashboardStats>({
    omzetKotor: 0,
    dibayarKePusat: 0,
    piutangMitra: 0,
    omzetKonsumen: 0,
    totalMitra: 0,
    biayaSample: 0,
  });
  const [auditStok, setAuditStok] = useState<ProductAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [rawTransactionItems, setRawTransactionItems] = useState<
    TransactionItemJoin[]
  >([]);
  const [rawPartnerReports, setRawPartnerReports] = useState<
    PartnerReportJoin[]
  >([]);

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

  // FIX: Fungsi ini sekarang dipanggil di bawah
  const updateURL = (month: number, year: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", month.toString());
    params.set("year", year.toString());
    router.push(`${window.location.pathname}?${params.toString()}`);
  };

  const fetchDashboardData = useCallback(async () => {
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

    const [reportsRes, prodsRes, itemsRes, mitraRes] = await Promise.all([
      supabase
        .from("partner_reports")
        .select(
          "qty, selling_price, commission_rate, mitra_id, product_id, created_at, product:product_id(name)",
        )
        .gte("created_at", start)
        .lte("created_at", end),
      supabase.from("products").select("*"),
      supabase
        .from("transaction_items")
        .select(
          `qty, remaining_qty_at_partner, price_at_time, product:product_id(name, base_price), transactions!inner(id, created_at, payment_status, payment_method, paid_amount, total_amount, is_sample, mitra:mitra_id(id, full_name, current_tier))`,
        )
        .lte("transactions.created_at", end),
      supabase.from("mitra").select("id", { count: "exact", head: true }),
    ]);

    if (prodsRes.data && reportsRes.data && itemsRes.data) {
      const items = itemsRes.data as unknown as TransactionItemJoin[];
      const reports = reportsRes.data as unknown as PartnerReportJoin[];
      setRawPartnerReports(reports);
      setRawTransactionItems(items);

      const itemsThisMonth = items.filter(
        (i) => i.transactions && i.transactions.created_at >= start,
      );

      const totalPaidDirect = itemsThisMonth
        .filter((i) => !i.transactions?.is_sample)
        .reduce((acc, curr) => {
          const isBeliPutus =
            curr.transactions?.payment_method === "QRIS" ||
            curr.transactions?.payment_method === "Transfer";
          const isUnique =
            itemsThisMonth.findIndex(
              (i) => i.transactions?.id === curr.transactions?.id,
            ) === itemsThisMonth.indexOf(curr);
          return (
            acc +
            (isUnique && isBeliPutus ? curr.transactions?.paid_amount || 0 : 0)
          );
        }, 0);

      let totalPelunasanPiutang = 0;
      for (const r of reports) {
        const originBatch = items.find(
          (i) =>
            i.transactions?.mitra?.id === r.mitra_id &&
            i.product?.name === r.product?.name,
        );
        if (originBatch?.transactions?.payment_method === "Piutang") {
          totalPelunasanPiutang +=
            (r.selling_price - r.commission_rate) * r.qty;
        }
      }

      setStats({
        omzetKotor: itemsThisMonth
          .filter((i) => !i.transactions?.is_sample)
          .reduce((a, c) => a + c.qty * (c.product?.base_price || 0), 0),
        dibayarKePusat: totalPaidDirect + totalPelunasanPiutang,
        piutangMitra: items
          .filter(
            (i) =>
              !i.transactions?.is_sample &&
              i.transactions?.payment_method === "Piutang",
          )
          .reduce(
            (a, c) => a + c.remaining_qty_at_partner * c.price_at_time,
            0,
          ),
        omzetKonsumen: reports.reduce((a, c) => a + c.selling_price * c.qty, 0),
        totalMitra: mitraRes.count || 0,
        biayaSample: itemsThisMonth
          .filter((i) => i.transactions?.is_sample)
          .reduce((a, c) => a + c.qty * (c.product?.base_price || 0), 0),
      });

      setAuditStok(
        prodsRes.data.map((p) => {
          const keluar = itemsThisMonth
            .filter((i) => i.product?.name === p.name)
            .reduce((a, c) => a + c.qty, 0);
          return {
            name: p.name,
            stokRealtime: p.stock,
            kapasitasTotal: p.initial_stock,
            barangKeluar: keluar,
            sisaStok: p.stock,
            status: p.stock < 10 ? "KRITIS" : "AMAN",
          };
        }),
      );
    }
    setLoading(false);
  }, [supabase, selectedMonth, selectedYear]);

  useEffect(() => {
    const triggerFetch = async () => {
      await fetchDashboardData();
    };
    triggerFetch();
  }, [fetchDashboardData]);

  const downloadMasterReport = () => {
    const wb = XLSX.utils.book_new();
    const toIDR = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

    // 1. Sheet Ringkasan Kas
    const dataKas = rawTransactionItems
      .filter((i) => !i.transactions?.is_sample)
      .map((item, idx) => {
        const isPiutang = item.transactions?.payment_method === "Piutang";
        const laku = item.qty - item.remaining_qty_at_partner;
        const danaMasukRiil = !isPiutang
          ? item.qty * item.price_at_time
          : laku * item.price_at_time;
        return {
          "NO": idx + 1,
          "TANGGAL": new Date(
            item.transactions?.created_at || "",
          ).toLocaleDateString("id-ID"),
          "MITRA": item.transactions?.mitra?.full_name || "N/A",
          "METODE": item.transactions?.payment_method || "N/A",
          "DIBAYAR KE PUSAT": toIDR(danaMasukRiil),
          "SISA PIUTANG": isPiutang
            ? toIDR(item.remaining_qty_at_partner * item.price_at_time)
            : "Rp 0",
        };
      });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(dataKas),
      "1. Ringkasan Kas",
    );

    // 2. Audit Stok Gudang (SELARAS DENGAN DASHBOARD)
    const dataStokExcel = auditStok.map((p, idx) => ({
      "NO": idx + 1,
      "NAMA PRODUK": p.name,
      "STOK AKTIF (GUDANG)": p.stokRealtime, // Bagian kiri dari tanda '/' di UI
      "TOTAL KAPASITAS": p.kapasitasTotal, // Bagian kanan dari tanda '/' di UI
      "KELUAR BULAN INI": p.barangKeluar,
      "STATUS": p.status,
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(dataStokExcel),
      "2. Audit Stok Gudang",
    );

    // 3. Sheet Detail Per Mitra
    const currentUniqueMitraIds = Array.from(
      new Set(
        rawTransactionItems
          .map((i) => i.transactions?.mitra?.id)
          .filter(Boolean),
      ),
    );

    currentUniqueMitraIds.forEach((id) => {
      const mName = rawTransactionItems.find(
        (i) => i.transactions?.mitra?.id === id,
      )?.transactions?.mitra?.full_name;
      const detail = rawTransactionItems
        .filter((i) => i.transactions?.mitra?.id === id)
        .map((item, idx) => {
          const isPiutang = item.transactions?.payment_method === "Piutang";
          const laku = item.qty - item.remaining_qty_at_partner;
          const omzet = rawPartnerReports
            .filter(
              (r) =>
                r.mitra_id === id && r.product?.name === item.product?.name,
            )
            .reduce((a, c) => a + c.selling_price * c.qty, 0);

          return {
            "NO": idx + 1,
            "TANGGAL": new Date(
              item.transactions?.created_at || "",
            ).toLocaleDateString("id-ID"),
            "PRODUK": item.product?.name || "N/A",
            "QTY DIAMBIL": item.qty,
            "STOK AKTIF (DI MITRA)": item.remaining_qty_at_partner,
            "EST. OMZET JUALAN": toIDR(omzet),
            "MODAL SETOR KE PUSAT": toIDR(
              !isPiutang
                ? item.qty * item.price_at_time
                : laku * item.price_at_time,
            ),
            "SISA PIUTANG": isPiutang
              ? toIDR(item.remaining_qty_at_partner * item.price_at_time)
              : "Rp 0",
          };
        });
      if (detail.length > 0 && mName) {
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(detail),
          `Mitra - ${mName.substring(0, 20)}`,
        );
      }
    });

    XLSX.writeFile(
      wb,
      `TRUJIVA_REPORT_${months[selectedMonth - 1]}_${selectedYear}.xlsx`,
    );
  };

  if (loading)
    return (
      <div className="p-20 text-center font-black animate-pulse text-green-800 uppercase italic">
        Syncing Dashboard...
      </div>
    );

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans text-gray-900">
      <header className="mb-10 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-green-900 italic uppercase tracking-tighter">
            Executive Dashboard
          </h1>
          <div className="flex items-center gap-2 text-orange-600 mt-1">
            <Calendar size={16} />
            <p className="text-[10px] font-black uppercase tracking-widest">
              Periode: {months[selectedMonth - 1]} {selectedYear}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl shadow-sm border border-gray-100">
            {/* FIX: Fungsi updateURL dipanggil di sini */}
            <select
              value={selectedMonth}
              onChange={(e) => updateURL(Number(e.target.value), selectedYear)}
              className="text-xs font-black uppercase outline-none bg-transparent cursor-pointer"
            >
              {months.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => updateURL(selectedMonth, Number(e.target.value))}
              className="text-xs font-black uppercase outline-none bg-transparent cursor-pointer ml-2"
            >
              {[2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={downloadMasterReport}
            className="bg-green-900 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-2 shadow-xl hover:scale-105 transition-all"
          >
            <FileBarChart size={18} /> Master Report (Excel)
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
        <StatCard
          title="Bruto Keluar"
          value={stats.omzetKotor}
          icon={<BarChart3 className="text-orange-500" />}
          color="bg-orange-50"
        />
        <StatCard
          title="Kas Masuk"
          value={stats.dibayarKePusat}
          icon={<Wallet className="text-green-600" />}
          color="bg-green-50"
          highlight
        />
        <StatCard
          title="Sisa Piutang"
          value={stats.piutangMitra}
          icon={<Clock className="text-red-500" />}
          color="bg-red-50"
        />
        <StatCard
          title="Penjualan Mitra"
          value={stats.omzetKonsumen}
          icon={<TrendingUp className="text-purple-500" />}
          color="bg-purple-50"
        />
        <StatCard
          title="Biaya Sample"
          value={stats.biayaSample}
          icon={<Gift className="text-blue-500" />}
          color="bg-blue-50"
        />
        <StatCard
          title="Total Mitra"
          value={stats.totalMitra}
          icon={<Users className="text-gray-500" />}
          color="bg-gray-50"
          isCurrency={false}
        />
      </div>

      <div className="bg-white rounded-[40px] shadow-2xl border border-gray-100 overflow-hidden">
        <div className="p-8 border-b border-gray-50 bg-gray-50/30 font-black text-xl text-green-900 uppercase italic">
          Audit Stok Gudang
        </div>
        <div className="p-8 overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b">
                <th className="pb-6 w-[45%]">Produk</th>
                <th className="pb-6 w-[20%] text-center">
                  Stok (Aktif / Total)
                </th>
                <th className="pb-6 w-[15%] text-center text-red-500">
                  Keluar
                </th>
                <th className="pb-6 w-[20%] text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {auditStok.map((item, idx) => (
                <tr
                  key={idx}
                  className="group hover:bg-gray-50/50 transition-all"
                >
                  <td className="py-6 font-black text-gray-700 uppercase italic whitespace-normal leading-relaxed pr-4">
                    {item.name}
                  </td>
                  <td className="py-6 text-center">
                    <span className="text-green-700 font-black text-lg">
                      {item.stokRealtime}
                    </span>
                    <span className="text-gray-300 font-bold mx-1">/</span>
                    <span className="text-gray-400 font-bold">
                      {item.kapasitasTotal}
                    </span>
                  </td>
                  <td className="py-6 font-black text-red-500 text-center">
                    -{item.barangKeluar}
                  </td>
                  <td className="py-6 text-center">
                    <span
                      className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase inline-block min-w-[70px] ${item.status === "AMAN" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                    >
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
  highlight = false,
  isCurrency = true,
}: StatCardUIProps) {
  return (
    <div
      className={`p-5 rounded-[25px] border border-gray-100 shadow-sm transition-all hover:-translate-y-1 ${highlight ? "ring-2 ring-green-500/20 bg-white" : "bg-white"}`}
    >
      <div
        className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center mb-3`}
      >
        {icon}
      </div>
      <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
        {title}
      </p>
      <h3
        className={`text-lg font-black tracking-tighter ${highlight ? "text-green-700" : "text-gray-900"}`}
      >
        {isCurrency ? `Rp ${value.toLocaleString("id-ID")}` : value}
      </h3>
    </div>
  );
}
