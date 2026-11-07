import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  IconUsers, IconBarChart, IconCheckCircle, IconMapPin, IconCalendar,
  IconChevronRight, IconChevronLeft, IconTrendingUp, IconClipboard, IconLock
} from '@/components/ui/icons'
const logoMark = '/provisit-icon.svg'

type Props = { onLogin: () => void }

const slides = [
  {
    eyebrow: 'ESPACE MANAGER',
    title: 'Pilotez vos équipes avec clarté.',
    text: 'Suivez les activités terrain, accompagnez vos collaborateurs et gardez une vision précise de vos objectifs.',
    points: [
      { icon: IconUsers, title: 'Pilotez', text: 'votre équipe', color: 'blue' },
      { icon: IconBarChart, title: 'Suivez', text: 'les performances', color: 'green' },
      { icon: IconCheckCircle, title: 'Analysez', text: 'les résultats', color: 'orange' },
      { icon: IconMapPin, title: 'Accompagnez', text: 'sur le terrain', color: 'blue' },
    ],
    metric: [{ label: 'Visites suivies', value: '532', trend: '+12%' }, { label: 'Taux de réalisation', value: '89%', trend: '+6%' }, { label: 'Équipe active', value: '17', trend: 'En activité' }],
  },
  {
    eyebrow: 'ESPACE ADMINISTRATION',
    title: 'Une vision globale. Des décisions éclairées.',
    text: 'Centralisez le pilotage de votre agence, analysez les tendances et développez une performance durable.',
    points: [
      { icon: IconBarChart, title: 'Pilotez', text: "l'activité globale", color: 'blue' },
      { icon: IconUsers, title: 'Analysez', text: 'les équipes', color: 'green' },
      { icon: IconCheckCircle, title: 'Décidez', text: 'avec confiance', color: 'orange' },
      { icon: IconTrendingUp, title: 'Développez', text: 'la performance', color: 'blue' },
    ],
    metric: [{ label: 'Activité globale', value: '3 842', trend: '+12%' }, { label: 'Performance', value: '92%', trend: '+6%' }, { label: 'Équipes actives', value: '17', trend: 'Pilotage global' }],
  },
  {
    eyebrow: 'ESPACE VISITE TERRAIN',
    title: 'Chaque visite compte. Chaque action avance.',
    text: 'Planifiez vos journées, retrouvez votre portefeuille et renseignez vos visites simplement, même en déplacement.',
    points: [
      { icon: IconCalendar, title: 'Planifiez', text: 'vos journées', color: 'blue' },
      { icon: IconMapPin, title: 'Visitez', text: 'sur le terrain', color: 'green' },
      { icon: IconClipboard, title: 'Renseignez', text: 'vos activités', color: 'orange' },
      { icon: IconLock, title: 'Progressez', text: 'en confiance', color: 'blue' },
    ],
    metric: [{ label: 'Programme du jour', value: '12', trend: 'Visites prévues' }, { label: 'Visites réalisées', value: '8', trend: '67% du jour' }, { label: 'Synchronisation', value: 'Active', trend: 'Données protégées' }],
  },
]

const colors: Record<string, string> = {
  blue: 'bg-[#163E63]',
  green: 'bg-[#1FA37A]',
  orange: 'bg-[#F28C28]',
}

export default function WelcomeScreen({ onLogin }: Props) {
  const [active, setActive] = useState(0)
  const slide = slides[active]
  const next = () => setActive((value) => (value + 1) % slides.length)
  const previous = () => setActive((value) => (value + slides.length - 1) % slides.length)

  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-[#F7FAFC] text-[#163E63]">
      <div className="pointer-events-none absolute -left-32 -top-36 h-96 w-96 rounded-full bg-[#1FA37A]/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-36 top-1/3 h-[28rem] w-[28rem] rounded-full bg-[#163E63]/10 blur-3xl" />
      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-7xl flex-col px-5 pb-6 pt-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3"><img src={logoMark} alt="" className="h-12 w-12 rounded-xl object-contain" /><span className="text-2xl font-black tracking-tight text-[#163E63]">PROVISIT</span></div>
          <div className="hidden items-center gap-2 rounded-full border border-[#163E63]/10 bg-white/80 px-4 py-2 text-xs font-bold tracking-wide text-[#163E63] shadow-sm sm:flex">
            <span className="h-2 w-2 rounded-full bg-[#1FA37A]" />
            PLATEFORME DE PILOTAGE
          </div>
        </header>

        <section className="grid flex-1 items-center gap-7 py-7 lg:grid-cols-[1.02fr_.98fr] lg:gap-12 lg:py-10">
          <div className="order-2 lg:order-1">
            <AnimatePresence mode="wait">
              <motion.div key={active} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: .35 }}>
                <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#1FA37A]/20 bg-[#1FA37A]/10 px-3 py-1.5 text-[10px] font-extrabold tracking-[.18em] text-[#147A5C] sm:text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#1FA37A]" /> {slide.eyebrow}
                </p>
                <h1 className="max-w-xl text-3xl font-extrabold leading-[1.12] tracking-tight text-[#163E63] sm:text-4xl lg:text-5xl">
                  {slide.title}
                </h1>
                <p className="mt-4 max-w-xl text-sm leading-7 text-[#526476] sm:text-base sm:leading-8">{slide.text}</p>

                <div className="mt-7 grid grid-cols-2 gap-3 sm:mt-9 sm:grid-cols-4 lg:max-w-2xl">
                  {slide.points.map(({ icon: Icon, title, text, color }) => (
                    <div key={title} className="rounded-2xl border border-[#163E63]/[.07] bg-white/85 p-3 text-center shadow-[0_8px_24px_rgba(22,62,99,.05)] sm:px-2 sm:py-4">
                      <span className={`mx-auto flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-sm ${colors[color]}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <p className="mt-2 text-xs font-extrabold text-[#163E63]">{title}</p>
                      <p className="mt-0.5 text-[10px] leading-4 text-[#657789]">{text}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="mt-7 flex items-center gap-3">
              <button type="button" onClick={previous} aria-label="Présentation précédente" className="flex h-9 w-9 items-center justify-center rounded-full border border-[#163E63]/15 bg-white text-[#163E63] transition hover:bg-[#163E63] hover:text-white"><IconChevronLeft className="h-4 w-4" /></button>
              <div className="flex items-center gap-2">
                {slides.map((item, index) => <button key={item.eyebrow} type="button" aria-label={`Afficher la présentation ${index + 1}`} onClick={() => setActive(index)} className={`h-2.5 rounded-full transition-all ${active === index ? 'w-8 bg-[#163E63]' : 'w-2.5 bg-[#B8C9D7] hover:bg-[#1FA37A]'}`} />)}
              </div>
              <button type="button" onClick={next} aria-label="Présentation suivante" className="flex h-9 w-9 items-center justify-center rounded-full border border-[#163E63]/15 bg-white text-[#163E63] transition hover:bg-[#163E63] hover:text-white"><IconChevronRight className="h-4 w-4" /></button>
              <span className="ml-1 text-[11px] font-semibold text-[#8293A1]">{active + 1} / 3</span>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <AnimatePresence mode="wait">
              <motion.div key={active} initial={{ opacity: 0, scale: .97, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .98 }} transition={{ duration: .4 }} className="relative mx-auto max-w-[590px]">
                <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-[#1FA37A]/15 via-white to-[#F28C28]/10 blur-xl" />
                <div className="relative overflow-hidden rounded-[2rem] border border-white bg-gradient-to-br from-[#163E63] via-[#1C5278] to-[#0C2D4A] p-4 shadow-[0_28px_80px_rgba(22,62,99,.22)] sm:rounded-[2.5rem] sm:p-7">
                  <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full border border-white/10" />
                  <div className="absolute -bottom-32 -left-24 h-72 w-72 rounded-full border border-white/10" />
                  <div className="relative flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><IconBarChart className="h-4 w-4 text-[#77D7B7]" /></span><div><p className="text-[10px] font-bold tracking-[.16em] text-white/60">PROVISIT</p><p className="text-sm font-bold text-white">Vue de pilotage</p></div></div>
                    <span className="rounded-full border border-[#77D7B7]/30 bg-[#1FA37A]/15 px-3 py-1.5 text-[9px] font-bold text-[#A8F0D7]">APERÇU ILLUSTRATIF</span>
                  </div>
                  <div className="relative mt-5 grid grid-cols-3 gap-2 sm:mt-7 sm:gap-3">
                    {slide.metric.map((metric) => <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/[.09] p-3 backdrop-blur-sm sm:p-4"><p className="text-[9px] leading-4 text-white/60 sm:text-[10px]">{metric.label}</p><p className="mt-1 text-xl font-extrabold tracking-tight text-white sm:text-2xl">{metric.value}</p><p className="mt-1 text-[9px] font-semibold text-[#A8F0D7]">{metric.trend}</p></div>)}
                  </div>
                  <div className="relative mt-3 rounded-2xl border border-white/10 bg-white/[.96] p-4 sm:mt-4 sm:p-5">
                    <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold text-[#163E63]">Activité & performance</p><p className="mt-1 text-[9px] text-[#8293A1]">Indicateurs de suivi</p></div><span className="rounded-lg bg-[#1FA37A]/10 px-2 py-1 text-[9px] font-bold text-[#147A5C]">Cette semaine</span></div>
                    <div className="mt-4 flex h-28 items-end gap-2 sm:h-36 sm:gap-3">
                      {[34, 52, 43, 72, 60, 84, 68, 96, 76, 88, 70, 100].map((height, i) => <div key={i} className="flex h-full flex-1 items-end"><div className={`w-full rounded-t-md ${i % 4 === 2 ? 'bg-[#F28C28]' : i % 3 === 0 ? 'bg-[#163E63]' : 'bg-[#1FA37A]'}`} style={{ height: `${height}%`, opacity: .82 + (i % 3) * .06 }} /></div>)}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-[#163E63]/[.07] pt-3 text-[9px] text-[#8293A1]"><span>Activité terrain</span><span>Suivi consolidé</span></div>
                  </div>
                  <div className="relative mt-4 flex items-center justify-between gap-3"><div className="flex -space-x-2">{['#163E63','#1FA37A','#F28C28','#6B8CA5'].map((color,i)=><span key={i} className="h-8 w-8 rounded-full border-2 border-[#163E63]" style={{background:color}} />)}</div><p className="text-[10px] font-medium text-white/65">Une vision claire, une équipe engagée.</p></div>
                </div>
                <div className="absolute -bottom-4 -left-2 hidden items-center gap-2 rounded-2xl border border-white bg-white px-4 py-3 shadow-xl sm:flex"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1FA37A]/10 text-[#1FA37A]"><IconLock className="h-5 w-5" /></span><div><p className="text-xs font-bold text-[#163E63]">Données structurées</p><p className="text-[10px] text-[#8293A1]">Pilotage en confiance</p></div></div>
              </motion.div>
            </AnimatePresence>
          </div>
        </section>

        <footer className="mt-auto border-t border-[#163E63]/10 pt-5">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="text-center sm:text-left"><p className="text-sm font-bold text-[#163E63]">Bienvenue sur Provisit</p><p className="mt-0.5 text-[11px] text-[#8293A1]">L’excellence au cœur de chaque visite.</p></div>
            <button type="button" onClick={onLogin} className="group flex w-full items-center justify-center gap-3 rounded-full bg-[#163E63] px-8 py-4 text-sm font-extrabold text-white shadow-[0_12px_30px_rgba(22,62,99,.2)] transition hover:-translate-y-0.5 hover:bg-[#1C5278] active:translate-y-0 sm:w-auto sm:min-w-[260px]">Se connecter <IconChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-1" /></button>
          </div>
          <p className="mt-4 text-center text-[9px] text-[#9AA8B4]">© {new Date().getFullYear()} Provisit · Plateforme de pilotage et de suivi des activités</p>
        </footer>
      </div>
    </main>
  )
}
