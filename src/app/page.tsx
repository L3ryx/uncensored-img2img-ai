'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import styles from './page.module.css';

interface GenerateRequest {
  image: string;
  prompt: string;
  negative_prompt: string;
  denoise_strength: number;
  guidance_scale: number;
  num_inference_steps: number;
  seed: number;
}

interface PromptHistoryEntry {
  prompt: string;
  timestamp: number;
}

export default function Home() {
  const [inputImage, setInputImage] = useState<string | null>(null);
  const [inputImageName, setInputImageName] = useState<string>('');
  const [outputImage, setOutputImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('ugly, blurry, low quality, artifacts, watermark, text, deformed, bad anatomy');
  const [denoiseStrength, setDenoiseStrength] = useState(0.55);
  const [guidanceScale, setGuidanceScale] = useState(7.5);
  const [steps, setSteps] = useState(12);
  const [seed, setSeed] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSeed, setLastSeed] = useState<number | null>(null);
  const [promptHistory, setPromptHistory] = useState<PromptHistoryEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loadingDots, setLoadingDots] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7860';

  // Animated loading dots
  useEffect(() => {
    if (!loading) return;
    let count = 0;
    const interval = setInterval(() => {
      count = (count + 1) % 4;
      setLoadingDots('.'.repeat(count));
    }, 400);
    return () => clearInterval(interval);
  }, [loading]);

  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file.');
      return;
    }
    setInputImageName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setInputImage(result);
      setOutputImage(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleGenerate = async () => {
    if (!inputImage) { setError('Please upload an image first.'); return; }
    if (!prompt.trim()) { setError('Please enter a prompt.'); return; }

    setLoading(true);
    setError(null);
    setOutputImage(null);

    try {
      // Extract base64 data from data URL
      const base64Data = inputImage.split(',')[1];

      const body: GenerateRequest = {
        image: base64Data,
        prompt: prompt.trim(),
        negative_prompt: negativePrompt.trim(),
        denoise_strength: denoiseStrength,
        guidance_scale: guidanceScale,
        num_inference_steps: steps,
        seed,
      };

      const response = await fetch(`${API_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(err.detail || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setOutputImage(`data:image/jpeg;base64,${data.image}`);
      setLastSeed(data.seed);

      // Save to history
      if (prompt.trim()) {
        setPromptHistory(prev => {
          const updated = [{ prompt: prompt.trim(), timestamp: Date.now() }, ...prev].slice(0, 10);
          return updated;
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!outputImage) return;
    const a = document.createElement('a');
    a.href = outputImage;
    a.download = `img2img_${lastSeed || Date.now()}.jpg`;
    a.click();
  };

  const handleUseOutput = () => {
    if (!outputImage) return;
    setInputImage(outputImage);
    setInputImageName('generated_output.jpg');
    setOutputImage(null);
  };

  const handleRandomSeed = () => setSeed(Math.floor(Math.random() * 2 ** 32));

  return (
    <main className={styles.main}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logo}>
            <span className={styles.logoMark}>◈</span>
            <span className={styles.logoText}>IMG2IMG</span>
            <span className={styles.logoBadge}>AI</span>
          </div>
          <nav className={styles.headerMeta}>
            <span className={styles.modelTag}>SD 1.5 CPU</span>
            <span className={styles.divider}>·</span>
            <span className={styles.modelTag}>CPU</span>
          </nav>
        </div>
      </header>

      <div className={styles.cpuBanner}>
          ⏱ Mode CPU gratuit — génération ~2-4 min · 512px max · 12 steps recommandés
        </div>
        <div className={styles.container}>
        {/* Left panel — Input */}
        <section className={styles.panel}>
          <div className={styles.panelLabel}>
            <span>01</span>
            <span>SOURCE IMAGE</span>
          </div>

          {/* Drop zone */}
          <div
            ref={dropZoneRef}
            className={`${styles.dropZone} ${isDragging ? styles.dragging : ''} ${inputImage ? styles.hasImage : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !inputImage && fileInputRef.current?.click()}
          >
            {inputImage ? (
              <div className={styles.imagePreview}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={inputImage} alt="Input preview" className={styles.previewImg} />
                <div className={styles.imageOverlay}>
                  <span className={styles.imageName}>{inputImageName}</span>
                  <button
                    className={styles.changeBtn}
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  >
                    CHANGE
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.dropContent}>
                <div className={styles.dropIcon}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                </div>
                <p className={styles.dropText}>DROP IMAGE HERE</p>
                <p className={styles.dropSub}>or click to browse — JPG, PNG, WEBP</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className={styles.fileInput}
            />
          </div>

          {/* Prompt */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              <span>PROMPT</span>
            </label>
            <textarea
              className={styles.textarea}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the desired output image in detail..."
              rows={4}
            />
          </div>

          {/* Prompt history */}
          {promptHistory.length > 0 && (
            <div className={styles.history}>
              <span className={styles.historyLabel}>RECENT PROMPTS</span>
              <div className={styles.historyList}>
                {promptHistory.slice(0, 5).map((entry, i) => (
                  <button
                    key={i}
                    className={styles.historyItem}
                    onClick={() => setPrompt(entry.prompt)}
                    title={entry.prompt}
                  >
                    {entry.prompt.substring(0, 60)}{entry.prompt.length > 60 ? '…' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Denoise strength */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              <span>DENOISE STRENGTH</span>
              <span className={styles.fieldValue}>{denoiseStrength.toFixed(2)}</span>
            </label>
            <div className={styles.sliderWrap}>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={denoiseStrength}
                onChange={(e) => setDenoiseStrength(parseFloat(e.target.value))}
                className={styles.slider}
              />
              <div className={styles.sliderTrack}>
                <div
                  className={styles.sliderFill}
                  style={{ width: `${((denoiseStrength - 0.1) / 0.9) * 100}%` }}
                />
              </div>
            </div>
            <div className={styles.sliderHints}>
              <span>SUBTLE</span>
              <span>CREATIVE</span>
            </div>
          </div>

          {/* Advanced toggle */}
          <button
            className={styles.advancedToggle}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <span>ADVANCED SETTINGS</span>
            <span className={`${styles.chevron} ${showAdvanced ? styles.chevronOpen : ''}`}>▼</span>
          </button>

          {showAdvanced && (
            <div className={styles.advanced}>
              {/* Negative prompt */}
              <div className={styles.field}>
                <label className={styles.fieldLabel}>NEGATIVE PROMPT</label>
                <textarea
                  className={styles.textarea}
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  rows={2}
                />
              </div>

              {/* Guidance scale */}
              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  <span>GUIDANCE SCALE</span>
                  <span className={styles.fieldValue}>{guidanceScale.toFixed(1)}</span>
                </label>
                <div className={styles.sliderWrap}>
                  <input
                    type="range" min="1" max="20" step="0.5"
                    value={guidanceScale}
                    onChange={(e) => setGuidanceScale(parseFloat(e.target.value))}
                    className={styles.slider}
                  />
                  <div className={styles.sliderTrack}>
                    <div className={styles.sliderFill} style={{ width: `${((guidanceScale - 1) / 19) * 100}%` }} />
                  </div>
                </div>
              </div>

              {/* Steps */}
              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  <span>INFERENCE STEPS</span>
                  <span className={styles.fieldValue}>{steps}</span>
                </label>
                <div className={styles.sliderWrap}>
                  <input
                    type="range" min="5" max="50" step="1"
                    value={steps}
                    onChange={(e) => setSteps(parseInt(e.target.value))}
                    className={styles.slider}
                  />
                  <div className={styles.sliderTrack}>
                    <div className={styles.sliderFill} style={{ width: `${((steps - 5) / 45) * 100}%` }} />
                  </div>
                </div>
              </div>

              {/* Seed */}
              <div className={styles.field}>
                <label className={styles.fieldLabel}>SEED</label>
                <div className={styles.seedRow}>
                  <input
                    type="number"
                    className={styles.seedInput}
                    value={seed}
                    onChange={(e) => setSeed(parseInt(e.target.value) || -1)}
                    placeholder="-1 (random)"
                  />
                  <button className={styles.randomBtn} onClick={handleRandomSeed} title="Random seed">
                    ⟳
                  </button>
                  {lastSeed !== null && (
                    <button
                      className={styles.lockSeedBtn}
                      onClick={() => setSeed(lastSeed)}
                      title={`Lock seed: ${lastSeed}`}
                    >
                      USE LAST ({lastSeed})
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className={styles.error}>
              <span className={styles.errorIcon}>!</span>
              <span>{error}</span>
            </div>
          )}

          {/* Generate button */}
          <button
            className={`${styles.generateBtn} ${loading ? styles.loading : ''}`}
            onClick={handleGenerate}
            disabled={loading || !inputImage}
          >
            {loading ? (
              <span className={styles.loadingInner}>
                <span className={styles.spinner} />
                GENERATING{loadingDots}
              </span>
            ) : (
              <span>GENERATE ◈</span>
            )}
          </button>
        </section>

        {/* Right panel — Output */}
        <section className={styles.panel}>
          <div className={styles.panelLabel}>
            <span>02</span>
            <span>OUTPUT</span>
          </div>

          <div className={`${styles.outputZone} ${outputImage ? styles.hasOutput : ''}`}>
            {loading && (
              <div className={styles.loadingOverlay}>
                <div className={styles.loadingBox}>
                  <div className={styles.loadingRing} />
                  <p className={styles.loadingText}>PROCESSING{loadingDots}</p>
                  <p className={styles.loadingSubtext}>SD 1.5 CPU · {steps} steps · ~2-4 min</p>
                </div>
              </div>
            )}

            {outputImage && !loading ? (
              <div className={styles.outputImage} style={{ animation: 'fadeUp 0.4s ease' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={outputImage} alt="Generated output" className={styles.previewImg} />
                {lastSeed !== null && (
                  <div className={styles.seedBadge}>
                    <span className={styles.font_mono}>SEED: {lastSeed}</span>
                  </div>
                )}
              </div>
            ) : !loading ? (
              <div className={styles.emptyOutput}>
                <div className={styles.emptyIcon}>◈</div>
                <p>Output will appear here</p>
              </div>
            ) : null}
          </div>

          {/* Output actions */}
          {outputImage && (
            <div className={styles.outputActions}>
              <button className={styles.actionBtn} onClick={handleDownload}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                DOWNLOAD
              </button>
              <button className={styles.actionBtnSecondary} onClick={handleUseOutput}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1 4 1 10 7 10"/>
                  <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                </svg>
                USE AS INPUT
              </button>
            </div>
          )}

          {/* Info box */}
          <div className={styles.infoBox}>
            <div className={styles.infoRow}>
              <span className={styles.infoKey}>MODEL</span>
              <span className={styles.infoVal}>SD 1.5 (CPU)</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoKey}>RESOLUTION</span>
              <span className={styles.infoVal}>512×512 max</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoKey}>SCHEDULER</span>
              <span className={styles.infoVal}>Euler Ancestral</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoKey}>PRECISION</span>
              <span className={styles.infoVal}>FP16</span>
            </div>
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <span>IMG2IMG AI · Stable Diffusion XL · HuggingFace Spaces</span>
      </footer>
    </main>
  );
}
