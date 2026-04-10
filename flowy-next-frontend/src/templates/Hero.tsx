import Link from 'next/link';

import { Background } from '../background/Background';
import { Button } from '../button/Button';
import { HeroOneButton } from '../hero/HeroOneButton';
import { Section } from '../layout/Section';
import { NavbarTwoColumns } from '../navigation/NavbarTwoColumns';

const Hero = () => (
  <Background color="bg-slate-900 relative overflow-hidden">
    {/* Ambient Glow */}
    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-[400px] bg-primary-500/20 blur-[100px] rounded-full pointer-events-none"></div>

    <Section yPadding="py-6 relative z-10">
      <NavbarTwoColumns logo={<span className="text-xl font-bold text-white tracking-tight">⚡ Flowy</span>}>
        <li>
          <Link href="#demo">
            <span className="text-slate-300 hover:text-white cursor-pointer transition">Live Demo</span>
          </Link>
        </li>
      </NavbarTwoColumns>
    </Section>

    <Section yPadding="pt-24 pb-32 relative z-10">
      <HeroOneButton
        title={
          <>
            <span className="text-white">{'Your meetings decide.\n'}</span>
            <span className="bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent">Flowy ships.</span>
          </>
        }
        description={
          <span className="text-slate-400">
            The AI PM agent that transforms transcripts into Jira tickets, PRDs, and Slack updates in seconds.
          </span>
        }
        button={
          <Link href="#demo">
            <button className="bg-primary-600 hover:bg-primary-500 text-white font-semibold py-4 px-8 rounded-full shadow-lg shadow-primary-600/30 transition-all hover:-translate-y-1 mt-4">
              Process a Meeting
            </button>
          </Link>
        }
      />
    </Section>
  </Background>
);

export { Hero };
