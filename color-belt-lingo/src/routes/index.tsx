import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Check, CheckCircle2, Infinity, CalendarDays, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { NinjaBrand } from "@/components/ninja-brand";
import { LearningPreview } from "@/components/learning-preview";
import { belts } from "@/lib/landing-samples";
import mascot from "@/assets/ninja-mascot.jpg";
import vocabulary from "@/assets/vocabulary-sync.jpg";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({ meta: [
    { title: "TalkNinja — Learn a language. Earn your belt." },
    { name: "description", content: "Learn from the language you already speak with color-connected vocabulary, voice practice, a conversational Friend, and a belt-by-belt path forward." },
    { property: "og:title", content: "TalkNinja — Learn a language. Earn your belt." },
    { property: "og:description", content: "Different languages. Shared meaning. Discover color-connected learning and a rewarding path from your first white belt." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
});

function Index() {
  const [dialog, setDialog] = useState<"belts" | "Monthly" | "Lifetime" | null>(null);
  return (
    <div id="top">
      <nav className="site-nav" aria-label="Main navigation"><div className="container-wide nav-inner"><NinjaBrand /><div className="nav-links"><a href="#training">The dojo</a><a href="#friend">Meet Friend</a><a href="#plans">Membership</a><Button variant="dojo" asChild><a href="#training">Start exploring <ArrowRight /></a></Button></div></div></nav>
      <main>
        <header className="hero"><div className="container-wide hero-grid"><div>
          <div className="hero-label"><span className="status-dot" /> A NEW LANGUAGE. A NEW SUPERPOWER.</div>
          <h1><span>TalkNinja.</span><span>New language.</span><span className="text-primary">Next belt.</span></h1>
          <p className="hero-copy">Start with the language you know. Learn the one you love. Connect the words, find your voice, and earn your progress—one belt at a time.</p>
          <div className="hero-actions"><Button variant="ninja" size="hero" asChild><a href="#training">Begin your white belt path <ArrowRight /></a></Button><Button variant="paper" size="hero" onClick={() => setDialog("belts")}>View the belt path</Button></div>
          <p className="hero-note"><CheckCircle2 size={14} /> Your language. Your pace. Your own little victories.</p>
        </div><div className="hero-art"><img src={mascot} alt="Friendly blue TalkNinja character wearing a white belt and holding a vocabulary scroll" width={816} height={816} fetchPriority="high" /><div className="mascot-note"><span className="belt belt-white" /><div><strong>Every ninja starts somewhere.</strong><p>Your white belt is waiting.</p></div></div></div></div></header>
        <section id="training" className="training-section"><div className="container-wide"><div className="section-heading"><span className="eyebrow">LESS MEMORIZING. MORE CONNECTING.</span><h2>See it. Say it. Make it yours.</h2><p>Words that belong together, in colors that bring them together.</p></div><LearningPreview onBelts={() => setDialog("belts")} /></div></section>
        <section id="vocabulary" className="vocabulary-section"><div className="container-wide vocabulary-grid"><img src={vocabulary} width={1008} height={704} loading="lazy" alt="Illustration of colorful vocabulary rows moving from a spreadsheet to a language-learning phone" /><div className="vocabulary-copy"><span className="eyebrow">YOUR WORDS. YOUR WORLD.</span><h2>Bring your own<br />vocabulary.</h2><p>The best words to learn are the ones you’ll actually use. Add your own words to Google Sheets and make them part of your training.</p><ul><li><Check /> Words for your work, travels, and everyday life</li><li><Check /> Practice built around your vocabulary</li><li><Check /> Listen with male and female voices</li></ul></div></div></section>
        <section id="plans" className="pricing-section"><div className="container-wide"><div className="section-heading"><span className="eyebrow">COMMIT TO YOUR NEXT CHAPTER</span><h2>Choose your path to mastery.</h2><p>A little practice today. A whole new world tomorrow.</p></div><div className="pricing-grid">
          <article className="plan"><span className="plan-label"><CalendarDays size={16} /> MONTHLY MEMBERSHIP</span><h3>One month at a time.</h3><p>Make language learning part of your routine.</p><ul><li><Check /> Color-connected vocabulary</li><li><Check /> Reading, writing, and voice practice</li><li><Check /> Belt-by-belt progress</li></ul><Button variant="inverse" size="hero" onClick={() => setDialog("Monthly")}>Explore Monthly <ArrowRight /></Button></article>
          <article className="plan plan-lifetime"><span className="plan-label"><Infinity size={18} /> LIFETIME MEMBERSHIP</span><h3>A lifelong adventure.</h3><p>Keep your curiosity. Keep your membership.</p><ul><li><Check /> A lasting place in the dojo</li><li><Check /> Practice conversations with Friend</li><li><Check /> Your own vocabulary, your own journey</li></ul><Button variant="dojo" size="hero" onClick={() => setDialog("Lifetime")}>Explore Lifetime <ArrowRight /></Button></article>
        </div><p className="pricing-note">Same curiosity. Two ways to keep it going.</p></div></section>
      </main>
      <footer className="site-footer"><div className="container-wide footer-inner"><NinjaBrand /><div className="footer-links"><a href="#training">The dojo</a><a href="#vocabulary">Your vocabulary</a><a href="#plans">Membership</a></div><p className="footer-copy">© 2026 TalkNinja. One word closer.</p></div></footer>
      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }}><DialogContent>
        {dialog === "belts" ? <><GraduationCap className="text-primary" size={28} /><DialogTitle>Your path, one belt at a time.</DialogTitle><DialogDescription>Start at white. Practice, pass your tests, and take on the next challenge as you progress.</DialogDescription><div className="belt-dialog-list">{belts.map((belt) => <div className="belt-dialog-item" key={belt.name}><span className={`belt ${belt.className}`} /><div><h3>{belt.name} belt</h3><p>{belt.text}</p></div></div>)}</div><Button variant="ninja" asChild onClick={() => setDialog(null)}><a href="#training">Explore the dojo <ArrowRight /></a></Button></> : <><DialogTitle>{dialog} membership</DialogTitle><DialogDescription>Membership purchases aren’t available on this preview yet. Pricing and the link to the existing app are still to come.</DialogDescription><Button variant="ninja" onClick={() => setDialog(null)}>Keep exploring</Button></>}
      </DialogContent></Dialog>
    </div>
  );
}
