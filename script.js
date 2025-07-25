// Sem vlož URL tvé nasazené Apps Script webové aplikace
const APPS_SCRIPT_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyl3ywCN1-tiaxwCsvQQvraYhiM0ULckyi7PDmmPcLfWWBs_iQZiZOr6Cmc4bC7DT9Q/exec"; 

// Seznam tvých depotů - DŮLEŽITÉ: Musí se přesně shodovat s názvy v tabulce!
const DPD_DEPOTS = [
    "1380", "1381", "1382", "1383", "1384", "1385", "1386", "1387",
    "1391", "1392", "1394", "1395", "2360", "2361", "2363", "2364",
    "2365", "2367", "2371", "2375"
];

let allData = []; // Uloží všechna data z Google Tabulky
let currentSelectedDepot = null;

document.addEventListener('DOMContentLoaded', () => {
    renderDepotButtons(); // Nejprve vykreslíme tlačítka pro depa
    fetchDataAndRender(); // Pak načteme data a zbytek
});

async function fetchDataAndRender() {
    document.getElementById('loading-indicator').style.display = 'block';
    document.getElementById('error-message').style.display = 'none';

    try {
        const response = await fetch(APPS_SCRIPT_WEB_APP_URL);
        if (!response.ok) {
            throw new Error(`HTTP chyba: ${response.status}`);
        }
        allData = await response.json();
        
        if (!currentSelectedDepot) {
            document.getElementById('novacek-list').innerHTML = '<p>Vyberte depo pro zobrazení nováčků a jejich formulářů.</p>';
        } else {
            renderNovackyForDepot(currentSelectedDepot);
        }

    } catch (error) {
        console.error("Chyba při načítání dat:", error);
        document.getElementById('error-message').style.display = 'block';
        document.getElementById('error-message').innerText = `Nepodařilo se načíst data: ${error.message}. Zkontrolujte nastavení Apps Scriptu a síťové připojení.`;
    } finally {
        document.getElementById('loading-indicator').style.display = 'none';
    }
}

function renderDepotButtons() {
    const depotSelectionDiv = document.getElementById('depot-selection');
    depotSelectionDiv.innerHTML = '<h2>Vyberte Depo:</h2>';
    DPD_DEPOTS.forEach(depot => {
        const button = document.createElement('button');
        button.className = 'depot-button';
        button.textContent = depot;
        button.onclick = () => selectDepot(depot);
        depotSelectionDiv.appendChild(button);
    });
}

function selectDepot(depotName) {
    currentSelectedDepot = depotName;
    document.querySelectorAll('.depot-button').forEach(btn => {
        if (btn.textContent === depotName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    renderNovackyForDepot(depotName);
}

function renderNovackyForDepot(depotName) {
    const novacekListDiv = document.getElementById('novacek-list');
    novacekListDiv.innerHTML = ''; 

    const formsForDepot = allData.filter(item => String(item['Depo']).trim() === String(depotName).trim());

    const novackyMap = new Map(); 
    formsForDepot.forEach(item => {
        if (!novackyMap.has(item['Jméno nováčka'])) {
            novackyMap.set(item['Jméno nováčka'], []);
        }
        novackyMap.get(item['Jméno nováčka']).push(item);
    });

    if (novackyMap.size === 0) {
        novacekListDiv.innerHTML = `<p>Pro depo "${depotName}" nejsou žádní nováčci s odeslanými formuláři v logu.</p>`;
        return;
    }

    const sortedNovackyNames = Array.from(novackyMap.keys()).sort((a, b) => a.localeCompare(b));

    sortedNovackyNames.forEach(novacekName => {
        const forms = novackyMap.get(novacekName);
        const novacekCard = document.createElement('div');
        novacekCard.className = 'novacek-card';
        novacekCard.innerHTML = `<h3>${novacekName}</h3>`;

        forms.sort((a, b) => {
            const typeOrder = {
                "Test": 1,
                "Zpětná vazba nováček": 2,
                "Zpětná vazba buddy": 3,
                "Ostatní": 4 
            };
            const typeA = typeOrder[a['Typ formuláře']] || 99;
            const typeB = typeOrder[b['Typ formuláře']] || 99;

            if (typeA !== typeB) {
                return typeA - typeB;
            }
            return a['Název formuláře'].localeCompare(b['Název formuláře']);
        });

        forms.forEach(form => {
            const formItem = document.createElement('div');
            formItem.className = 'form-item';
            
            const checkboxId = `checkbox-${form['ID záznamu']}`; 
            const isChecked = form['Stav vyplnění'] === 'Vyplněno';

            formItem.innerHTML = `
                <label for="${checkboxId}">
                    <input type="checkbox" id="${checkboxId}" data-record-id="${form['ID záznamu']}" ${isChecked ? 'checked' : ''}>
                    ${form['Název formuláře']} (${form['Typ formuláře']}) - <a href="${form['URL formuláře']}" target="_blank">Odkaz</a>
                </label>
            `;
            novacekCard.appendChild(formItem);

            formItem.querySelector(`#${checkboxId}`).addEventListener('change', (event) => {
                const recordId = event.target.dataset.recordId;
                const newStatus = event.target.checked ? 'Vyplněno' : '';
                updateFormStatus(recordId, newStatus);
            });
        });
        novacekListDiv.appendChild(novacekCard);
    });
}

async function updateFormStatus(recordId, newStatus) {
    const formData = new FormData();
    formData.append('recordId', recordId);
    formData.append('status', newStatus);

    try {
        const response = await fetch(APPS_SCRIPT_WEB_APP_URL, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            // Pokud HTTP status není OK (např. 4xx, 5xx), je to chyba serveru nebo sítě
            const errorText = await response.text(); // Zkusíme přečíst odpověď jako text pro ladění
            console.error(`HTTP chyba (${response.status}) při aktualizaci stavu pro ${recordId}: ${errorText}`);
            alert(`Nepodařilo se aktualizovat stav: Chyba serveru (${response.status}). Zkontrolujte konzoli.`); 
            
            // Vrátíme checkbox do původního stavu
            const checkbox = document.querySelector(`[data-record-id="${recordId}"]`);
            if (checkbox) {
                checkbox.checked = (newStatus === ''); // Pokud byl newStatus 'Vyplněno', vrátí se na false (nevyplněno)
            }
            return; // Ukončíme funkci po chybě
        }

        let result;
        try {
            // Pokusíme se parsovat odpověď jako JSON
            result = await response.json();
        } catch (jsonError) {
            // Pokud selže parsování JSON, znamená to, že Apps Script nevrátil JSON
            const rawResponseText = await response.text(); // Získáme surový text odpovědi pro ladění
            console.error(`Chyba parsování JSON odpovědi pro ${recordId}:`, jsonError);
            console.error(`Surová odpověď z Apps Scriptu:`, rawResponseText);
            alert(`Nepodařilo se aktualizovat stav: Neočekávaná odpověď ze serveru. Zkontrolujte konzoli.`);
            
            // Vrátíme checkbox do původního stavu
            const checkbox = document.querySelector(`[data-record-id="${recordId}"]`);
            if (checkbox) {
                checkbox.checked = (newStatus === ''); 
            }
            return; // Ukončíme funkci po chybě
        }

        // Zde pokračujeme, pokud je odpověď platný JSON
        if (result.status === 'success') {
            console.log(`Stav pro ${recordId} úspěšně aktualizován na ${newStatus}`);
            const itemToUpdate = allData.find(item => item['ID záznamu'] === recordId);
            if (itemToUpdate) {
                itemToUpdate['Stav vyplnění'] = newStatus;
            }
            // Zde již nebudeme zobrazovat alert o úspěchu, abychom zbytečně nerušili
        } else {
            // Pokud Apps Script vrátil status: 'error' (což by se mělo stát, pokud doPost najde problém)
            console.error(`Chyba při aktualizaci stavu pro ${recordId}: ${result.message}`);
            alert(`Chyba při aktualizaci stavu: ${result.message}`);
            
            // Vrátíme checkbox do původního stavu
            const checkbox = document.querySelector(`[data-record-id="${recordId}"]`);
            if (checkbox) {
                checkbox.checked = (newStatus === ''); 
            }
        }
    } catch (error) {
        // Tento catch blok zachytí obecné síťové chyby (např. "Failed to fetch" pokud nebylo možné navázat spojení)
        console.error("Chyba při odesílání aktualizace (síťová/neznámá chyba):", error);
        alert(`Nepodařilo se aktualizovat stav. Chyba sítě: ${error.message}. Zkontrolujte připojení.`);
        
        // Vrátíme checkbox do původního stavu
        const checkbox = document.querySelector(`[data-record-id="${recordId}"]`);
        if (checkbox) {
            checkbox.checked = (newStatus === '');
        }
    }
}
