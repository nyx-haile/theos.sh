import { drawNativeStage, drawRaycastStage } from "./draw.js";
import { clearRasterCache, ensureFontReady, rasterizeGlyph, splitGraphemes } from "./font-mask.js";
import { layoutGlyphs } from "./layout.js";
import { directionFromAngle, interactionRules } from "./raycast.js";

const MODEL_FONT_SIZE = 210;
const MODEL_FONT_WEIGHT = 400;
const MAX_GRAPHEMES = 20;

const elements = {
  text: document.querySelector("#sample-text"),
  font: document.querySelector("#font-family"),
  upload: document.querySelector("#font-upload"),
  uploadName: document.querySelector("#upload-name"),
  angle: document.querySelector("#shadow-angle"),
  angleNumber: document.querySelector("#shadow-angle-number"),
  angleValue: document.querySelector("#angle-value"),
  fall: document.querySelector("#ray-fall"),
  rule: document.querySelector("#interaction-rule"),
  toleranceField: document.querySelector("#tolerance-field"),
  tolerance: document.querySelector("#outlier-tolerance"),
  toleranceValue: document.querySelector("#tolerance-value"),
  showShadows: document.querySelector("#show-shadows"),
  showRays: document.querySelector("#show-rays"),
  mainCanvas: document.querySelector("#raycast-canvas"),
  nativeCanvas: document.querySelector("#native-canvas"),
  pairList: document.querySelector("#pair-list"),
  widthStat: document.querySelector("#width-stat"),
  contactStat: document.querySelector("#contact-stat"),
  ruleDescription: document.querySelector("#rule-description"),
  status: document.querySelector("#status"),
  geometrySummary: document.querySelector("#geometry-summary"),
  reset: document.querySelector("#reset-controls"),
};

const state = {
  fontFamily: elements.font.value,
  fontLabel: elements.font.options[elements.font.selectedIndex].text,
  selectedPair: 0,
  layout: null,
  previewText: elements.text.value,
  uploadOption: null,
  renderToken: 0,
};

function currentOptions() {
  const angle = Number(elements.angle.value);
  return {
    angle,
    direction: directionFromAngle(angle, elements.fall.value),
    rule: elements.rule.value,
    ruleOptions: {
      outlierTolerance: Number(elements.tolerance.value) / 100,
    },
  };
}

function setStatus(message, kind = "") {
  elements.status.textContent = message;
  elements.status.dataset.kind = kind;
}

function syncRuleControls() {
  const rule = interactionRules[elements.rule.value];
  elements.toleranceField.hidden = rule.id !== "robust-edge";
  elements.ruleDescription.textContent = rule.description;
}

function renderPairList(layout) {
  elements.pairList.replaceChildren();
  layout.pairs.forEach((pair) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pair-chip";
    button.dataset.selected = String(pair.index === state.selectedPair);
    button.setAttribute("aria-pressed", String(pair.index === state.selectedPair));
    const deltaEm = pair.delta / MODEL_FONT_SIZE;
    const sign = deltaEm > 0 ? "+" : "";
    const label = document.createElement("span");
    const arrow = document.createElement("i");
    const value = document.createElement("small");
    label.append(pair.from.replaceAll(" ", "·"));
    arrow.textContent = "→";
    label.append(arrow, pair.to.replaceAll(" ", "·"));
    value.textContent = pair.interaction ? `${sign}${deltaEm.toFixed(3)}em` : "native";
    button.append(label, value);
    button.title = pair.reason ?? `${pair.interaction.candidateCount.toLocaleString()} candidate rays`;
    button.addEventListener("click", () => {
      state.selectedPair = pair.index;
      draw();
      renderPairList(layout);
    });
    elements.pairList.append(button);
  });
}

function draw() {
  if (!state.layout) return;
  const options = currentOptions();
  drawRaycastStage(elements.mainCanvas, state.layout, {
    ...options,
    selectedPair: state.selectedPair,
    showShadows: elements.showShadows.checked,
    showRays: elements.showRays.checked,
  });
  const font = `${MODEL_FONT_WEIGHT} ${MODEL_FONT_SIZE}px ${state.fontFamily}`;
  drawNativeStage(elements.nativeCanvas, state.previewText, {
    font,
    fontSize: MODEL_FONT_SIZE,
  });
}

async function recompute({ rerasterize = false } = {}) {
  const token = ++state.renderToken;
  setStatus("Casting rays…");

  if (rerasterize) clearRasterCache();
  const graphemes = splitGraphemes(elements.text.value).slice(0, MAX_GRAPHEMES);
  state.previewText = graphemes.join("");
  if (!graphemes.length) {
    state.layout = { glyphs: [], pairs: [], width: 0 };
    elements.widthStat.textContent = "0.00em";
    elements.contactStat.textContent = "0/0";
    elements.geometrySummary.textContent = "The raycast specimen is empty.";
    renderPairList(state.layout);
    setStatus("Enter some text to cast.");
    draw();
    return;
  }

  const font = `${MODEL_FONT_WEIGHT} ${MODEL_FONT_SIZE}px ${state.fontFamily}`;
  await ensureFontReady(font);
  if (token !== state.renderToken) return;

  const glyphs = graphemes.map((char) =>
    rasterizeGlyph(char, {
      fontFamily: state.fontFamily,
      fontSize: MODEL_FONT_SIZE,
      fontWeight: MODEL_FONT_WEIGHT,
    }),
  );
  const options = currentOptions();
  const layout = layoutGlyphs(glyphs, options);
  if (token !== state.renderToken) return;

  state.layout = layout;
  state.selectedPair = Math.min(state.selectedPair, Math.max(0, layout.pairs.length - 1));
  elements.widthStat.textContent = `${(layout.width / MODEL_FONT_SIZE).toFixed(2)}em`;
  const contacts = layout.pairs.filter((pair) => pair.interaction).length;
  elements.contactStat.textContent = `${contacts}/${layout.pairs.length}`;
  elements.geometrySummary.textContent =
    `Raycast layout for ${state.previewText}: ${contacts} of ${layout.pairs.length} ` +
    `pairs contact, with an ink width of ${(layout.width / MODEL_FONT_SIZE).toFixed(2)} em.`;
  renderPairList(layout);
  draw();

  const clipped = splitGraphemes(elements.text.value).length > MAX_GRAPHEMES;
  setStatus(
    clipped ? `Preview limited to ${MAX_GRAPHEMES} graphemes.` : `${state.fontLabel} · ${graphemes.length} graphemes`,
    clipped ? "warning" : "ready",
  );
}

function updateAngle(value) {
  const angle = Math.max(10, Math.min(90, Number(value) || 10));
  elements.angle.value = String(angle);
  elements.angleNumber.value = String(angle);
  elements.angleValue.textContent = `${angle.toFixed(0)}°`;
  recompute();
}

let textTimer;
elements.text.addEventListener("input", () => {
  clearTimeout(textTimer);
  textTimer = setTimeout(() => recompute(), 100);
});
elements.font.addEventListener("change", () => {
  state.fontFamily = elements.font.value;
  const selected = elements.font.options[elements.font.selectedIndex];
  state.fontLabel = selected.dataset.uploadName ?? selected.text;
  elements.uploadName.textContent = selected.dataset.uploadName ?? "Upload font";
  recompute({ rerasterize: true });
});
elements.upload.addEventListener("change", async () => {
  const [file] = elements.upload.files;
  if (!file) return;
  try {
    setStatus(`Loading ${file.name}…`);
    const family = `RaycastUpload${Date.now()}`;
    const face = new FontFace(family, await file.arrayBuffer());
    await face.load();
    document.fonts.add(face);
    state.uploadOption?.remove();
    const option = document.createElement("option");
    option.value = family;
    option.textContent = `Custom · ${file.name}`;
    option.dataset.uploadName = file.name;
    elements.font.append(option);
    elements.font.value = family;
    state.uploadOption = option;
    state.fontFamily = family;
    state.fontLabel = file.name;
    elements.uploadName.textContent = file.name;
    recompute({ rerasterize: true });
  } catch (error) {
    setStatus(`Could not load that font: ${error.message}`, "warning");
  }
});
elements.angle.addEventListener("input", (event) => updateAngle(event.target.value));
elements.angleNumber.addEventListener("change", (event) => updateAngle(event.target.value));
elements.fall.addEventListener("change", () => recompute());
elements.rule.addEventListener("change", () => {
  syncRuleControls();
  recompute();
});
elements.tolerance.addEventListener("input", () => {
  elements.toleranceValue.textContent = `${elements.tolerance.value}%`;
  recompute();
});
elements.showShadows.addEventListener("change", draw);
elements.showRays.addEventListener("change", draw);
elements.reset.addEventListener("click", () => {
  elements.angle.value = "72";
  elements.angleNumber.value = "72";
  elements.angleValue.textContent = "72°";
  elements.fall.value = "down";
  elements.rule.value = "first-touch";
  elements.tolerance.value = "2";
  elements.toleranceValue.textContent = "2%";
  elements.showShadows.checked = true;
  elements.showRays.checked = true;
  syncRuleControls();
  recompute();
});

const resizeObserver = new ResizeObserver(draw);
resizeObserver.observe(elements.mainCanvas);
resizeObserver.observe(elements.nativeCanvas);
syncRuleControls();
recompute({ rerasterize: true });
