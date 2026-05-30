// ===========================
// SOCIAL WALL — wall.js
// ===========================

// Determine the backend base URL dynamically (e.g. if accessed via Live Server or VPS ports)
const getBackendUrl = () => {
  const { protocol, hostname, port } = window.location;
  if (port === "3008") {
    return `${protocol}//${hostname}:5005`;
  }
  if (port && port !== "3000") {
    return `${protocol}//${hostname}:3000`;
  }
  return "";
};
const BACKEND_URL = window.location.origin;

console.log("[WALL] BACKEND_URL:", BACKEND_URL);

const socket = io(BACKEND_URL, {
  path: "/socket.io/",
  transports: ["websocket", "polling"],
});

console.log("[WALL] Socket.IO connecting...");

socket.on("connect", () => {
  console.log("[WALL] ✅ Socket connected! ID:", socket.id);
});

socket.on("connect_error", (err) => {
  console.error("[WALL] ❌ Socket connection error:", err.message);
});

socket.on("disconnect", (reason) => {
  console.log("[WALL] Socket disconnected:", reason);
});
const NUM_ROWS = 4;

const contentEls = [];
const cloneEls = [];

for (let i = 1; i <= NUM_ROWS; i++) {
  contentEls.push(document.getElementById(`content-${i}`));
  cloneEls.push(document.getElementById(`clone-${i}`));
}

const wallContainer = document.getElementById("wall-container");
const emptyState = document.getElementById("empty-state");

let allImages = [];
const newImageIds = new Set(); // Tracks image IDs that are in the 5-second highlight window

// ===========================
// CREATE CARD HTML
// ===========================
function createCardHTML(image) {
  if (!image) return "";
  const feedback = image.feedback || image.text || "";
  // Check if this image ID is currently within its 5 second glowing window
  const newClass = newImageIds.has(image.id) ? " new-card highlight" : "";
  return `
    <div class="wall-card${newClass}" data-id="${image.id}">
      <img class="card-avatar" src="${image.image_path}" alt="${feedback}" data-color="${image.bg_color || ""}" loading="lazy">
      ${feedback ? `<span class="card-text">${escapeHtml(feedback)}</span>` : ""}
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ===========================
// DISTRIBUTE IMAGES TO ROWS
// ===========================
function renderWall() {
  if (allImages.length === 0) {
    wallContainer.style.display = "none";
    emptyState.classList.add("visible");
    return;
  }

  wallContainer.style.display = "flex";
  emptyState.classList.remove("visible");

  // Clear all rows
  contentEls.forEach((el) => (el.innerHTML = ""));
  cloneEls.forEach((el) => (el.innerHTML = ""));

  // Distribute images across rows (round-robin)
  const rowImages = [[], [], [], []];
  allImages.forEach((img, i) => {
    rowImages[i % NUM_ROWS].push(img);
  });

  // Need minimum cards for smooth marquee, duplicate if needed
  for (let r = 0; r < NUM_ROWS; r++) {
    let cards = rowImages[r];

    // Ensure enough cards for seamless loop on ANY screen size (min 20 cards)
    // 20 cards guarantees it will comfortably span a 4K ultra-wide display
    while (cards.length > 0 && cards.length < 20) {
      cards = cards.concat(rowImages[r]);
    }

    const html = cards.map((img) => createCardHTML(img)).join("");
    contentEls[r].innerHTML = html;
    cloneEls[r].innerHTML = html; // Duplicate for seamless loop
  }
}

// ===========================
// ADD NEW IMAGE TO A ROW
// ===========================
function addImageToWall(image) {
  if (!image || image.id == null) return;
  allImages.unshift(image);

  // Determine which row gets it (distribute evenly)
  const rowIndex = (allImages.length - 1) % NUM_ROWS;

  wallContainer.style.display = "flex";
  emptyState.classList.remove("visible");

  // Add card to both content and clone
  const cardHTML = createCardHTML(image, true);
  contentEls[rowIndex].insertAdjacentHTML("afterbegin", cardHTML);
  cloneEls[rowIndex].insertAdjacentHTML(
    "afterbegin",
    createCardHTML(image, true),
  );

  // Remove the highlight class after 5 seconds
  setTimeout(() => {
    document
      .querySelectorAll(`.wall-card[data-id="${image.id}"]`)
      .forEach((card) => {
        card.classList.remove("highlight");
      });
  }, 10000);
}

// ===========================
// REMOVE IMAGE FROM WALL
// ===========================
function removeImageFromWall(imageId) {
  allImages = allImages.filter((img) => img.id !== imageId);
  // Re-render the whole wall to ensure marquee card duplication stays intact
  renderWall();
}

// ===========================
// UPDATE IMAGE ON WALL
// ===========================
function updateImageOnWall(image) {
  // Update in allImages array
  const idx = allImages.findIndex((i) => i.id === image.id);
  if (idx !== -1) allImages[idx] = image;

  // Update all matching cards
  document
    .querySelectorAll(`.wall-card[data-id="${image.id}"]`)
    .forEach((card) => {
      const textEl = card.querySelector(".card-text");
      const feedback = image.feedback || image.text || "";
      if (feedback) {
        if (textEl) {
          textEl.textContent = feedback;
        } else {
          card.insertAdjacentHTML(
            "beforeend",
            `<span class="card-text">${escapeHtml(feedback)}</span>`,
          );
        }
      } else if (textEl) {
        textEl.remove();
      }
    });
}

// ===========================
// SOCKET.IO EVENTS
// ===========================
socket.on("new-image", (image) => {
  console.log('[WALL] 📨 Received "new-image" event:', JSON.stringify(image));
  if (!image || image.id == null) {
    console.log("[WALL] ❌ Skipping - invalid image object");
    return;
  }

  // Track this image as "new" for 5 seconds
  allImages.unshift(image);
  newImageIds.add(image.id);

  // Re-render entire wall immediately (it will pick up the highlight true state from the Set)
  renderWall();

  // Automatically strip the highlight class after 5 seconds and remove from Set
  setTimeout(() => {
    newImageIds.delete(image.id);
    document
      .querySelectorAll(`.wall-card[data-id="${image.id}"]`)
      .forEach((card) => {
        card.classList.remove("highlight", "new-card");
      });
  }, 10000);

  console.log("[WALL] ✅ Image added to wall");
});

socket.on("remove-image", (data) => {
  removeImageFromWall(data.id);
});

socket.on("update-image", (image) => {
  updateImageOnWall(image);
});

socket.on("reset-wall", () => {
  console.log(
    '[WALL] 💥 Received "reset-wall" event from admin, dropping all images instantly',
  );
  allImages = [];
  renderWall();
});

// ===========================
// INITIAL LOAD
// ===========================
async function loadImages() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/images`);
    const images = await res.json();
    allImages = images;
    renderWall();
  } catch (err) {
    console.error("Failed to load images:", err);
  }
}

loadImages();
