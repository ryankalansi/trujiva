"use client";
import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase";
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
} from "lucide-react";

// --- Interface Definisi Data ---
interface DashboardStats {
  omzetKotor: number;
  dibayarKePusat: number;
  piutangMitra: number;
  omzetKonsumen: number;
  totalMitra: number;
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
  product: { name: string; base_price: number } | null;
  transactions: {
    mitra: { id: string; full_name: string; current_tier: string } | null;
    payment_method: string;
    payment_status: string;
    paid_amount: number;
    total_amount: number;
    created_at: string;
  } | null;
}
interface PartnerReportJoin {
  mitra_id: string;
  product: { name: string } | null;
  qty: number;
  selling_price: number;
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

// Interface Excel yang Fleksibel (Mendukung NO sebagai string "" untuk baris total)
interface ExcelKasRow {
  "NO": number | string;
  "MITRA": string;
  "STATUS": string;
  "DIBAYAR KE PUSAT": string;
  "SISA PIUTANG": string;
}

interface ExcelIndividualRow {
  "NO": number | string;
  "TANGGAL": string;
  "PRODUK": string;
  "QTY DIAMBIL": number | string;
  "STOK DI TANGAN": number | string;
  "OMZET PENJUALAN": string;
  "MODAL KE PUSAT": string;
  "PIUTANG": string;
}

export default function ExecutiveDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const [stats, setStats] = useState<DashboardStats>({
    omzetKotor: 0,
    dibayarKePusat: 0,
    piutangMitra: 0,
    omzetKonsumen: 0,
    totalMitra: 0,
  });
  const [auditStok, setAuditStok] = useState<ProductAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [rawTransactionItems, setRawTransactionItems] = useState<
    TransactionItemJoin[]
  >([]);
  const [rawPartnerReports, setRawPartnerReports] = useState<
    PartnerReportJoin[]
  >([]);

  const currentMonthName = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date());

  useEffect(() => {
    async function fetchDashboardData() {
      const now = new Date();
      const firstDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
      ).toISOString();
      const lastDay = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
      ).toISOString();

      const [transRes, reportsRes, prodsRes, itemsRes, mitraRes] =
        await Promise.all([
          supabase
            .from("transactions")
            .select("total_amount, paid_amount")
            .gte("created_at", firstDay)
            .lte("created_at", lastDay),
          supabase
            .from("partner_reports")
            .select(
              "qty, selling_price, mitra_id, created_at, product:product_id(name)",
            )
            .gte("created_at", firstDay)
            .lte("created_at", lastDay),
          supabase.from("products").select("*"),
          supabase
            .from("transaction_items")
            .select(
              `
          qty, remaining_qty_at_partner, product:product_id(name, base_price), 
          transactions:transaction_id(created_at, payment_method, payment_status, paid_amount, total_amount, mitra:mitra_id(id, full_name, current_tier))
        `,
            )
            .gte("transactions.created_at", firstDay)
            .lte("transactions.created_at", lastDay),
          supabase.from("mitra").select("id", { count: "exact", head: true }),
        ]);

      if (transRes.data && prodsRes.data && reportsRes.data && itemsRes.data) {
        const items = itemsRes.data as unknown as TransactionItemJoin[];
        const reports = reportsRes.data as unknown as PartnerReportJoin[];
        setRawPartnerReports(reports);
        setRawTransactionItems(items);

        const totalPaid = transRes.data.reduce(
          (a, c) => a + (Number(c.paid_amount) || 0),
          0,
        );
        const totalUnpaid = transRes.data.reduce(
          (a, c) => a + (Number(c.total_amount) || 0),
          0,
        );
        const totalOmzet = reports.reduce(
          (a, c) => a + c.selling_price * c.qty,
          0,
        );

        setStats({
          omzetKotor: items.reduce(
            (acc, curr) => acc + curr.qty * (curr.product?.base_price || 0),
            0,
          ),
          dibayarKePusat: totalPaid,
          piutangMitra: totalUnpaid,
          omzetKonsumen: totalOmzet,
          totalMitra: mitraRes.count || 0,
        });

        setAuditStok(
          prodsRes.data.map((p) => ({
            name: p.name,
            stokAwal: p.initial_stock,
            barangKeluar: p.initial_stock - p.stock,
            sisaStok: p.stock,
            status: p.stock < 50 ? "MENIPIS" : "AMAN",
          })),
        );
      }
      setLoading(false);
    }
    fetchDashboardData();
  }, [supabase]);

  const toIDR = (num: number) => `Rp ${num.toLocaleString("id-ID")}`;

  const downloadMasterReport = () => {
    if (rawTransactionItems.length === 0)
      return alert("Data bulan ini masih kosong!");
    const wb = XLSX.utils.book_new();

    // 1. SHEET: RINGKASAN KAS
    const summaryPaid = rawTransactionItems.reduce(
      (a, c) => a + (c.transactions?.paid_amount || 0),
      0,
    );
    const summaryUnpaid = rawTransactionItems.reduce(
      (a, c) => a + (c.transactions?.total_amount || 0),
      0,
    );

    const dataArusKas: ExcelKasRow[] = rawTransactionItems.map((item, idx) => ({
      "NO": idx + 1,
      "MITRA": item.transactions?.mitra?.full_name || "N/A",
      "STATUS": item.transactions?.payment_status || "N/A",
      "DIBAYAR KE PUSAT": toIDR(item.transactions?.paid_amount || 0),
      "SISA PIUTANG": toIDR(item.transactions?.total_amount || 0),
    }));

    dataArusKas.push({
      "NO": "",
      "MITRA": "TOTAL AKUMULASI",
      "STATUS": "",
      "DIBAYAR KE PUSAT": toIDR(summaryPaid),
      "SISA PIUTANG": toIDR(summaryUnpaid),
    });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(dataArusKas),
      "1. Ringkasan Kas",
    );

    // 2. SHEET: DATA MITRA & KOMISI
    const uniqueIds = Array.from(
      new Set(rawTransactionItems.map((i) => i.transactions?.mitra?.id)),
    );
    const commissionRates: Record<string, string> = {
      "Member": "0%",
      "Reseller": "15%",
      "Sub-Agen": "25%",
      "Agen": "35%",
      "Distributor": "45%",
    };
    const dataMitra = uniqueIds.map((id, idx) => {
      const m = rawTransactionItems.find(
        (i) => i.transactions?.mitra?.id === id,
      )?.transactions?.mitra;
      return {
        "NO": idx + 1,
        "NAMA MITRA": m?.full_name || "Unknown",
        "TIER LEVEL": m?.current_tier || "Member",
        "DISKON KOMISI": commissionRates[m?.current_tier || "Member"] || "0%",
      };
    });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(dataMitra),
      "2. Data Mitra & Komisi",
    );

    // 3. SHEET INDIVIDUAL PER MITRA
    uniqueIds.forEach((mId) => {
      if (!mId) return;
      const mTrans = rawTransactionItems.filter(
        (i) => i.transactions?.mitra?.id === mId,
      );
      const mReports = rawPartnerReports.filter((r) => r.mitra_id === mId);
      const mName = mTrans[0].transactions?.mitra?.full_name || "Unknown";

      let tModal = 0;
      let tPiutang = 0;
      let tOmzet = 0;

      const detailRows: ExcelIndividualRow[] = mTrans.map((f, i) => {
        const report = mReports.find(
          (r) => r.product?.name === f.product?.name,
        );
        const omzet = report ? report.qty * report.selling_price : 0;
        tModal += f.transactions?.paid_amount || 0;
        tPiutang += f.transactions?.total_amount || 0;
        tOmzet += omzet;

        return {
          "NO": i + 1,
          "TANGGAL": new Date(
            f.transactions?.created_at || "",
          ).toLocaleDateString("id-ID"),
          "PRODUK": f.product?.name || "N/A",
          "QTY DIAMBIL": f.qty,
          "STOK DI TANGAN": f.remaining_qty_at_partner,
          "OMZET PENJUALAN": toIDR(omzet),
          "MODAL KE PUSAT": toIDR(f.transactions?.paid_amount || 0),
          "PIUTANG": toIDR(f.transactions?.total_amount || 0),
        };
      });

      detailRows.push({
        "NO": "",
        "TANGGAL": "TOTAL",
        "PRODUK": "",
        "QTY DIAMBIL": "",
        "STOK DI TANGAN": "",
        "OMZET PENJUALAN": toIDR(tOmzet),
        "MODAL KE PUSAT": toIDR(tModal),
        "PIUTANG": toIDR(tPiutang),
      });

      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(detailRows),
        `Mitra - ${mName}`.substring(0, 31),
      );
    });

    // 4. SHEET: AUDIT STOK GUDANG
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(auditStok),
      "Audit Stok Gudang",
    );

    XLSX.writeFile(
      wb,
      `TRUJIVA_REPORT_${currentMonthName.replace(" ", "_")}.xlsx`,
    );
  };

  if (loading)
    return (
      <div className="p-20 text-center font-black animate-pulse text-green-800 uppercase italic">
        Sinkronisasi Dashboard...
      </div>
    );

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans text-gray-900">
      <header className="mb-10 flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-black text-green-900 italic uppercase tracking-tighter">
            Executive Dashboard
          </h1>
          <div className="flex items-center gap-2 text-orange-600 mt-1">
            <CalendarDays size={16} />
            <p className="text-[10px] font-black uppercase tracking-widest">
              Periode: {currentMonthName}
            </p>
          </div>
        </div>
        <button
          onClick={downloadMasterReport}
          className="bg-green-900 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-2 shadow-xl hover:scale-105 transition-all"
        >
          <FileBarChart size={18} /> Master Report (Excel)
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-12">
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
          title="Total Mitra"
          value={stats.totalMitra}
          icon={<Users className="text-gray-500" />}
          color="bg-gray-50"
          isCurrency={false}
        />
      </div>

      <div className="bg-white rounded-[40px] shadow-2xl border border-gray-100 overflow-hidden">
        <div className="p-8 border-b border-gray-50 bg-gray-50/30">
          <h2 className="text-xl font-black text-green-900 italic uppercase flex items-center gap-2">
            <Package size={24} /> Audit Stok Gudang
          </h2>
        </div>
        <div className="p-8 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b">
                <th className="pb-6">Produk</th>
                <th className="pb-6">Stok Awal</th>
                <th className="pb-6 text-red-500">Barang Keluar</th>
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
