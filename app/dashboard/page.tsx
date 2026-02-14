"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Wallet,
  Clock,
  Users,
  Package,
  TrendingUp,
  FileBarChart,
  BarChart3,
  CalendarDays,
  Filter,
  Gift,
} from "lucide-react";

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
  stokAwal: number;
  barangKeluar: number;
  sisaStok: number;
  status: string;
}
interface TransactionItemJoin {
  qty: number;
  remaining_qty_at_partner: number;
  product_id: string;
  product: { name: string; base_price: number } | null;
  transactions: {
    id: string;
    mitra: { id: string; full_name: string; current_tier: string } | null;
    payment_method: string;
    payment_status: string;
    paid_amount: number;
    total_amount: number;
    created_at: string;
    is_sample: boolean;
  } | null;
}
interface PartnerReportJoin {
  mitra_id: string;
  product: { name: string } | null;
  qty: number;
  selling_price: number;
  commission_rate: number;
  created_at: string;
}
interface StatCardProps {
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
  >([]); // Sekarang akan digunakan

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

  const updateURL = (month: number, year: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", month.toString());
    params.set("year", year.toString());
    router.push(`${window.location.pathname}?${params.toString()}`);
  };

  const fetchDashboardData = useCallback(async () => {
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

    const [reportsRes, prodsRes, itemsRes, allPiutangRes, mitraRes] =
      await Promise.all([
        supabase
          .from("partner_reports")
          .select(
            "qty, selling_price, commission_rate, mitra_id, created_at, product:product_id(name)",
          )
          .gte("created_at", startOfMonth)
          .lte("created_at", endOfMonth),
        supabase.from("products").select("*"),
        supabase
          .from("transaction_items")
          .select(
            `qty, product_id, remaining_qty_at_partner, product:product_id(name, base_price), transactions!inner(id, created_at, payment_method, payment_status, paid_amount, total_amount, is_sample, mitra:mitra_id(id, full_name, current_tier))`,
          )
          .gte("transactions.created_at", startOfMonth)
          .lte("transactions.created_at", endOfMonth),
        supabase
          .from("transaction_items")
          .select(
            `remaining_qty_at_partner, price_at_time, transactions!inner(is_sample)`,
          )
          .gt("remaining_qty_at_partner", 0)
          .eq("transactions.is_sample", false),
        supabase.from("mitra").select("id", { count: "exact", head: true }),
      ]);

    if (prodsRes.data && reportsRes.data && itemsRes.data) {
      const items = itemsRes.data as unknown as TransactionItemJoin[];
      const reports = reportsRes.data as unknown as PartnerReportJoin[];
      const piutangBatches = allPiutangRes.data || [];

      setRawPartnerReports(reports);
      setRawTransactionItems(items);

      const totalPaidDirect = items
        .filter((i) => !i.transactions?.is_sample)
        .reduce((a, c) => a + (c.transactions?.paid_amount || 0), 0);
      const totalPelunasanPiutang = reports.reduce(
        (a, c) => a + (c.selling_price - c.commission_rate) * c.qty,
        0,
      );
      const totalOutstandingPiutang = piutangBatches.reduce(
        (a, c) => a + c.remaining_qty_at_partner * c.price_at_time,
        0,
      );
      const totalOmzetMitra = reports.reduce(
        (a, c) => a + c.selling_price * c.qty,
        0,
      );
      const totalBruto = items
        .filter((i) => !i.transactions?.is_sample)
        .reduce(
          (acc, curr) => acc + curr.qty * (curr.product?.base_price || 0),
          0,
        );
      const costSample = items
        .filter((i) => i.transactions?.is_sample)
        .reduce(
          (acc, curr) => acc + curr.qty * (curr.product?.base_price || 0),
          0,
        );

      setStats({
        omzetKotor: totalBruto,
        dibayarKePusat: totalPaidDirect + totalPelunasanPiutang,
        piutangMitra: totalOutstandingPiutang,
        omzetKonsumen: totalOmzetMitra,
        totalMitra: mitraRes.count || 0,
        biayaSample: costSample,
      });

      setAuditStok(
        prodsRes.data.map((p) => {
          const keluarPeriodeIni = items
            .filter((item) => item.product_id === p.id)
            .reduce((acc, curr) => acc + curr.qty, 0);
          return {
            name: p.is_active ? p.name : `${p.name} (OFF)`,
            stokAwal: p.stock + keluarPeriodeIni,
            barangKeluar: keluarPeriodeIni,
            sisaStok: p.stock,
            status: p.stock < 10 ? "KRITIS" : p.stock < 50 ? "MENIPIS" : "AMAN",
          };
        }),
      );
    }
    setLoading(false);
  }, [supabase, selectedMonth, selectedYear]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (isMounted) await fetchDashboardData();
    })();
    return () => {
      isMounted = false;
    };
  }, [fetchDashboardData]);

  const toIDR = (num: number) => `Rp ${num.toLocaleString("id-ID")}`;

  const downloadMasterReport = () => {
    if (rawTransactionItems.length === 0)
      return alert("Data periode ini masih kosong!");
    const wb = XLSX.utils.book_new();

    // Sheet 1: Arus Kas
    const dataKas = rawTransactionItems
      .filter((i) => !i.transactions?.is_sample)
      .map((item, idx) => ({
        "NO": idx + 1,
        "TANGGAL": new Date(
          item.transactions?.created_at || "",
        ).toLocaleDateString("id-ID"),
        "MITRA": item.transactions?.mitra?.full_name || "N/A",
        "STATUS": item.transactions?.payment_status || "N/A",
        "DIBAYAR KE PUSAT (DP)": toIDR(item.transactions?.paid_amount || 0),
        "SISA PIUTANG": toIDR(item.transactions?.total_amount || 0),
      }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(dataKas),
      "1. Arus Kas Transaksi",
    );

    // Sheet 2: Pelunasan dari Laporan Jualan (FIX ESLint: Gunakan rawPartnerReports di sini)
    const dataLaporan = rawPartnerReports.map((r, idx) => ({
      "NO": idx + 1,
      "TANGGAL LAPOR": new Date(r.created_at).toLocaleDateString("id-ID"),
      "PRODUK": r.product?.name || "N/A",
      "QTY LAKU": r.qty,
      "DANA MASUK PUSAT": toIDR((r.selling_price - r.commission_rate) * r.qty),
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(dataLaporan),
      "2. Pelunasan Piutang",
    );

    XLSX.writeFile(wb, `TRUJIVA_REPORT_${months[selectedMonth - 1]}.xlsx`);
  };

  if (loading)
    return (
      <div className="p-20 text-center font-black animate-pulse text-green-800 uppercase italic">
        Syncing Dashboard...
      </div>
    );

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans text-gray-900">
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-green-900 italic uppercase tracking-tighter">
            Executive Dashboard
          </h1>
          <div className="flex items-center gap-2 text-orange-600 mt-1">
            <CalendarDays size={16} />
            <p className="text-[10px] font-black uppercase tracking-widest">
              Periode Aktif: {months[selectedMonth - 1]} {selectedYear}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl shadow-sm border border-gray-100">
            <Filter size={14} className="text-green-800" />
            <select
              value={selectedMonth}
              onChange={(e) => updateURL(Number(e.target.value), selectedYear)}
              className="text-xs font-black uppercase outline-none bg-transparent"
            >
              {months.map(
                (m, i) =>
                  (i + 1 <= new Date().getMonth() + 1 ||
                    selectedYear < new Date().getFullYear()) && (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ),
              )}
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
          title="Omzet Mitra"
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
        <div className="p-8 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
          <h2 className="text-xl font-black text-green-900 italic uppercase flex items-center gap-2">
            <Package size={24} /> Audit Stok Gudang
          </h2>
        </div>
        <div className="p-8 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b">
                <th className="pb-6">Produk</th>
                <th className="pb-6">Est. Stok Awal</th>
                <th className="pb-6 text-red-500">Keluar Bln Ini</th>
                <th className="pb-6 text-green-700">Sisa Stok</th>
                <th className="pb-6 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {auditStok.map((item, idx) => (
                <tr
                  key={idx}
                  className="group hover:bg-gray-50/50 transition-all"
                >
                  <td className="py-6 font-black text-gray-700 uppercase italic">
                    {item.name}
                  </td>
                  <td className="py-6 font-bold text-gray-400">
                    {item.stokAwal}
                  </td>
                  <td className="py-6 font-black text-red-500">
                    -{item.barangKeluar}
                  </td>
                  <td className="py-6 font-black text-green-700 text-lg">
                    {item.sisaStok}
                  </td>
                  <td className="py-6 text-center">
                    <span
                      className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase ${item.status === "AMAN" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
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
}: StatCardProps) {
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
