// What is kept across projects: the user's looks (presets, with the default for new projects) and the brand kit
// used by the title cards.
import { useCallback, useEffect, useRef, useState } from 'react';
import { BUILT_IN_PRESETS, Preset } from '../../engine/look';
import { Brand, DEFAULT_BRAND, loadTitleFonts } from '../../engine/titles';
import { loadBrand, loadPresets, saveBrand } from '../services/presetStore';
import { toastError } from '../components/toast';

export function useLibrary() {
  const [presets, setPresets] = useState<Preset[]>(BUILT_IN_PRESETS);
  const [defaultPresetId, setDefaultPresetId] = useState(BUILT_IN_PRESETS[0].id);
  const refreshPresets = useCallback(async () => { const r = await loadPresets(); setPresets(r.presets); setDefaultPresetId(r.defaultId); }, []);
  useEffect(() => { refreshPresets(); }, [refreshPresets]);

  const [brand, setBrandState] = useState<Brand>(DEFAULT_BRAND);
  useEffect(() => { loadBrand().then(setBrandState).catch(() => {}); loadTitleFonts(); }, []);
  // typing in the brand fields saves once the typing stops
  const brandSave = useRef<number | null>(null);
  const setBrand = useCallback((b: Brand) => {
    setBrandState(b);
    if (brandSave.current) window.clearTimeout(brandSave.current);
    brandSave.current = window.setTimeout(() => { saveBrand(b).catch(toastError); }, 400);
  }, []);

  /** the preset new projects start with */
  const defaultPreset = () => presets.find((x) => x.id === defaultPresetId) ?? presets[0];

  return { presets, defaultPresetId, refreshPresets, defaultPreset, brand, setBrand };
}
