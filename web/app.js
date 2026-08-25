// Global state
let selectedCLI = null;
let selectedResolution = null;
let availableCLIs = [];
let availableResolutions = [];
let generatedWallpapers = [];

// DOM elements
const cliGrid = document.getElementById('cliGrid');
const resolutionGrid = document.getElementById('resolutionGrid');
const generateBtn = document.getElementById('generateBtn');
const previewSection = document.getElementById('previewSection');
const previewImage = document.getElementById('previewImage');
const downloadBtn = document.getElementById('downloadBtn');
const regenerateBtn = document.getElementById('regenerateBtn');
const galleryGrid = document.getElementById('galleryGrid');
const searchInput = document.getElementById('searchInput');
const filterSelect = document.getElementById('filterSelect');
const loadingOverlay = document.getElementById('loadingOverlay');
const errorModal = document.getElementById('errorModal');
const errorMessage = document.getElementById('errorMessage');
const errorModalClose = document.getElementById('errorModalClose');

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    setupEventListeners();
    renderCLIGrid();
    renderResolutionGrid();
    renderGallery();
});

// Load data from API
async function loadData() {
    try {
        const [clisResponse, resolutionsResponse, wallpapersResponse] = await Promise.all([
            fetch('/api/clis'),
            fetch('/api/resolutions'),
            fetch('/api/wallpapers')
        ]);

        const clisData = await clisResponse.json();
        const resolutionsData = await resolutionsResponse.json();
        const wallpapersData = await wallpapersResponse.json();

        if (clisData.success) availableCLIs = clisData.data;
        if (resolutionsData.success) availableResolutions = resolutionsData.data;
        if (wallpapersData.success) generatedWallpapers = wallpapersData.data;

        // Populate filter select
        populateFilterSelect();
    } catch (error) {
        showError('Failed to load data: ' + error.message);
    }
}

// Setup event listeners
function setupEventListeners() {
    generateBtn.addEventListener('click', generateWallpaper);
    downloadBtn.addEventListener('click', downloadWallpaper);
    regenerateBtn.addEventListener('click', generateWallpaper);
    searchInput.addEventListener('input', filterGallery);
    filterSelect.addEventListener('change', filterGallery);
    errorModalClose.addEventListener('click', hideError);
    
    // Close modal when clicking outside
    errorModal.addEventListener('click', (e) => {
        if (e.target === errorModal) hideError();
    });
}

// Render CLI grid
function renderCLIGrid() {
    cliGrid.innerHTML = '';
    
    availableCLIs.forEach(cli => {
        const card = document.createElement('div');
        card.className = 'cli-card';
        card.innerHTML = `
            <h3>${cli.toUpperCase()}</h3>
            <p>${getCLIDescription(cli)}</p>
        `;
        
        card.addEventListener('click', () => selectCLI(cli));
        cliGrid.appendChild(card);
    });
}

// Render resolution grid
function renderResolutionGrid() {
    resolutionGrid.innerHTML = '';
    
    availableResolutions.forEach(resolution => {
        const btn = document.createElement('button');
        btn.className = 'resolution-btn';
        btn.innerHTML = `
            <div>${resolution.name}</div>
            <div style="font-size: 0.8rem; color: #888;">${resolution.width}×${resolution.height}</div>
        `;
        
        btn.addEventListener('click', () => selectResolution(resolution));
        resolutionGrid.appendChild(btn);
    });
}

// Select CLI
function selectCLI(cli) {
    selectedCLI = cli;
    
    // Update UI
    document.querySelectorAll('.cli-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    event.target.closest('.cli-card').classList.add('selected');
    
    updateGenerateButton();
}

// Select resolution
function selectResolution(resolution) {
    selectedResolution = resolution;
    
    // Update UI
    document.querySelectorAll('.resolution-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    event.target.classList.add('selected');
    
    updateGenerateButton();
}

// Update generate button state
function updateGenerateButton() {
    const isEnabled = selectedCLI && selectedResolution;
    generateBtn.disabled = !isEnabled;
}

// Generate wallpaper
async function generateWallpaper() {
    if (!selectedCLI || !selectedResolution) return;
    
    showLoading();
    
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                cli: selectedCLI,
                resolution: selectedResolution.name
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Show preview
            previewImage.src = data.imagePath;
            previewSection.style.display = 'block';
            
            // Reload gallery
            await loadData();
            renderGallery();
            
            // Scroll to preview
            previewSection.scrollIntoView({ behavior: 'smooth' });
        } else {
            showError(data.error);
        }
    } catch (error) {
        showError('Failed to generate wallpaper: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Download wallpaper
function downloadWallpaper() {
    if (!previewImage.src) return;
    
    const link = document.createElement('a');
    link.href = previewImage.src;
    link.download = `${selectedCLI}-${selectedResolution.name}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Render gallery
function renderGallery() {
    galleryGrid.innerHTML = '';
    
    const filteredWallpapers = filterWallpapers();
    
    filteredWallpapers.forEach(wallpaper => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.innerHTML = `
            <img src="${wallpaper.path}" alt="${wallpaper.filename}" />
            <div class="gallery-item-info">
                <h4>${wallpaper.cli.toUpperCase()}</h4>
                <p>${wallpaper.resolution}</p>
            </div>
        `;
        
        item.addEventListener('click', () => {
            previewImage.src = wallpaper.path;
            previewSection.style.display = 'block';
            previewSection.scrollIntoView({ behavior: 'smooth' });
        });
        
        galleryGrid.appendChild(item);
    });
}

// Filter wallpapers
function filterWallpapers() {
    let filtered = generatedWallpapers;
    
    // Filter by search term
    const searchTerm = searchInput.value.toLowerCase();
    if (searchTerm) {
        filtered = filtered.filter(wallpaper => 
            wallpaper.cli.toLowerCase().includes(searchTerm) ||
            wallpaper.resolution.toLowerCase().includes(searchTerm)
        );
    }
    
    // Filter by CLI
    const selectedFilter = filterSelect.value;
    if (selectedFilter) {
        filtered = filtered.filter(wallpaper => wallpaper.cli === selectedFilter);
    }
    
    return filtered;
}

// Populate filter select
function populateFilterSelect() {
    const uniqueCLIs = [...new Set(generatedWallpapers.map(w => w.cli))];
    
    filterSelect.innerHTML = '<option value="">All CLI Tools</option>';
    uniqueCLIs.forEach(cli => {
        const option = document.createElement('option');
        option.value = cli;
        option.textContent = cli.toUpperCase();
        filterSelect.appendChild(option);
    });
}

// Filter gallery
function filterGallery() {
    renderGallery();
}

// Show loading overlay
function showLoading() {
    loadingOverlay.style.display = 'flex';
}

// Hide loading overlay
function hideLoading() {
    loadingOverlay.style.display = 'none';
}

// Show error modal
function showError(message) {
    errorMessage.textContent = message;
    errorModal.style.display = 'flex';
}

// Hide error modal
function hideError() {
    errorModal.style.display = 'none';
}

// Get CLI description
function getCLIDescription(cli) {
    const descriptions = {
        'git': 'Version control commands',
        'docker': 'Container management',
        'kubernetes': 'Container orchestration',
        'npm': 'Package management',
        'salesforce': 'sf CLI — referência de comandos'
    };
    
    return descriptions[cli] || 'CLI commands';
}
