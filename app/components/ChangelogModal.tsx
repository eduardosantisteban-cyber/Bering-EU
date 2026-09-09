"use client";

import { APP_VERSION, CHANGELOG } from "@/lib/constants";
import { ModalHeader, Overlay } from "./ui";

export default function ChangelogModal({ onClose }: { onClose: () => void }) {
  return (
    <Overlay onClose={onClose}>
      <div className="flex max-h-[80vh] w-[min(560px,92vw)] flex-col rounded-xl bg-white">
        <ModalHeader title="Historial de versiones" subtitle={`Versión actual: v${APP_VERSION}`} onClose={onClose} />
        <div className="flex-1 overflow-y-auto p-5">
          <ul className="flex flex-col gap-4">
            {CHANGELOG.map((entry) => (
              <li key={entry.version} className="border-l-2 border-[#e2e0dc] pl-3">
                <span className="text-sm font-semibold text-[#282828]">v{entry.version}</span>
                <p className="text-sm text-[#606060]">{entry.desc}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Overlay>
  );
}
