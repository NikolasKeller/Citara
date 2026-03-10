// ===========================
// Citara — AI Visibility Audit
// ===========================

(function () {
    var API_BASE = "https://citara-production.up.railway.app";

    var PROMPT_TEMPLATES = [
        { template: "Who are the best known names in {industry} right now?", platform: "ChatGPT" },
        { template: "Who are the top {industry} providers or experts?", platform: "Perplexity" },
        { template: "Compare the leading names in {industry} — who should I choose?", platform: "ChatGPT" },
        { template: "I'm looking for a great {industry} provider. Who do you recommend?", platform: "Claude" },
        { template: "What are the best alternatives in the {industry} space?", platform: "Perplexity" },
        { template: "Who are the most recognized leaders in {industry}?", platform: "Gemini" },
        { template: "What should I look for when choosing a {industry} provider?", platform: "ChatGPT" },
    ];

    function generatePrompts(industry) {
        return PROMPT_TEMPLATES.map(function (t) {
            return {
                prompt: t.template.replace(/\{industry\}/g, industry),
                platform: t.platform,
            };
        });
    }

    // Auto-detect industry from company name via API
    async function detectIndustry(companyName, websiteUrl) {
        try {
            var response = await fetch(API_BASE + "/api/detect-industry", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ company: companyName, website: websiteUrl }),
            });
            if (!response.ok) return { industry: "business services", excludeFromCompetitors: [] };
            var data = await response.json();
            return {
                industry: data.industry || "business services",
                excludeFromCompetitors: (data.excludeFromCompetitors || []).map(function (s) { return s.toLowerCase(); }),
            };
        } catch (err) {
            return { industry: "business services", excludeFromCompetitors: [] };
        }
    }

    // Call our backend proxy which routes to the correct AI platform
    async function queryPlatform(companyName, websiteUrl, prompt, platform) {
        try {
            var response = await fetch(API_BASE + "/api/audit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    company: companyName,
                    website: websiteUrl,
                    prompt: prompt,
                    platform: platform,
                }),
            });
            if (!response.ok) throw new Error("API error " + response.status);
            return await response.json();
        } catch (err) {
            return {
                answer: "Error querying " + platform,
                found: false,
                competitors: [],
            };
        }
    }

    async function runVisibilityAudit(companyName, websiteUrl, industry, prompts) {
        var results = [];
        for (var i = 0; i < prompts.length; i++) {
            var p = prompts[i];
            var res = await queryPlatform(companyName, websiteUrl, p.prompt, p.platform);
            results.push({
                prompt: p.prompt,
                platform: p.platform,
                answer: res.answer || "",
                found: res.found || false,
                competitors: (res.competitors || []).filter(function (c) {
                    return c.toLowerCase() !== companyName.toLowerCase();
                }),
            });
        }
        return results;
    }

    // DOM elements
    var companyInput = document.getElementById("companyName");
    var websiteInput = document.getElementById("websiteUrl");
    var industryInput = document.getElementById("industryInput");
    var runAuditBtn = document.getElementById("runAuditBtn");
    var formPhase = document.getElementById("auditForm");
    var scanPhase = document.getElementById("auditScanning");
    var resultsPhase = document.getElementById("auditResults");

    if (!companyInput || !runAuditBtn) return;

    // Enable/disable button based on company name
    companyInput.addEventListener("input", function () {
        runAuditBtn.disabled = !companyInput.value.trim();
    });

    // Run audit
    runAuditBtn.addEventListener("click", async function () {
        var company = companyInput.value.trim();
        if (!company) return;
        var website = websiteInput.value.trim();
        var industry = industryInput.value.trim();

        // Switch to scanning phase
        formPhase.style.display = "none";
        scanPhase.style.display = "block";
        document.getElementById("scanningCompany").textContent = "Checking visibility for " + company;

        var steps = scanPhase.querySelectorAll(".scan-step");

        // Step 0: Generating prompts (auto-detect industry if not provided)
        updateScanStep(steps, 0);
        var excludeList = [];
        if (!industry) {
            var detected = await detectIndustry(company, website);
            industry = detected.industry;
            excludeList = detected.excludeFromCompetitors;
        }
        var prompts = generatePrompts(industry);
        markStepDone(steps, 0);

        // Step 1: Querying ChatGPT
        updateScanStep(steps, 1);
        var chatgptPrompts = prompts.filter(function (p) { return p.platform === "ChatGPT"; });
        var chatgptResults = [];
        for (var i = 0; i < chatgptPrompts.length; i++) {
            var r = await queryPlatform(company, website, chatgptPrompts[i].prompt, "ChatGPT");
            chatgptResults.push(Object.assign({ prompt: chatgptPrompts[i].prompt, platform: "ChatGPT" }, r));
        }
        markStepDone(steps, 1);

        // Step 2: Querying Perplexity
        updateScanStep(steps, 2);
        var perplexityPrompts = prompts.filter(function (p) { return p.platform === "Perplexity"; });
        var perplexityResults = [];
        for (var i = 0; i < perplexityPrompts.length; i++) {
            var r = await queryPlatform(company, website, perplexityPrompts[i].prompt, "Perplexity");
            perplexityResults.push(Object.assign({ prompt: perplexityPrompts[i].prompt, platform: "Perplexity" }, r));
        }
        markStepDone(steps, 2);

        // Step 3: Querying Claude & Gemini
        updateScanStep(steps, 3);
        var otherPrompts = prompts.filter(function (p) { return p.platform === "Claude" || p.platform === "Gemini"; });
        var otherResults = [];
        for (var i = 0; i < otherPrompts.length; i++) {
            var r = await queryPlatform(company, website, otherPrompts[i].prompt, otherPrompts[i].platform);
            otherResults.push(Object.assign({ prompt: otherPrompts[i].prompt, platform: otherPrompts[i].platform }, r));
        }
        markStepDone(steps, 3);

        // Combine results in original prompt order
        var allResultsMap = {};
        [chatgptResults, perplexityResults, otherResults].forEach(function (arr) {
            arr.forEach(function (r) { allResultsMap[r.prompt] = r; });
        });
        var results = prompts.map(function (p) {
            var r = allResultsMap[p.prompt] || { answer: "Error", found: false, competitors: [] };
            return {
                prompt: p.prompt,
                platform: p.platform,
                answer: r.answer || "",
                found: r.found || false,
                competitors: (r.competitors || []).filter(function (c) {
                    var cLower = c.toLowerCase();
                    var compLower = company.toLowerCase();
                    return cLower !== compLower && cLower.indexOf(compLower) === -1 && compLower.indexOf(cLower) === -1;
                }),
            };
        });

        // Step 4: Analyzing
        updateScanStep(steps, 4);
        await sleep(800);
        markStepDone(steps, 4);

        // Calculate score
        var found = results.filter(function (r) { return r.found; }).length;
        var score = Math.round((found / results.length) * 100);

        // Aggregate competitors — filter out platforms the company works WITH (not competes with)
        // Common SaaS platforms that are tools, not consultancies
        var knownPlatforms = ["airtable", "zapier", "make", "integromat", "monday.com", "monday",
            "asana", "notion", "clickup", "salesforce", "hubspot", "jira", "slack", "trello",
            "google sheets", "microsoft", "excel", "power automate", "n8n", "workato",
            "zapier tables", "smartsuite", "nocodb", "coda", "stackby", "baserow", "parabola",
            "automate.io", "pabbly", "tray.io", "celigo", "unito", "fivetran", "hightouch"];
        // Merge API-detected exclusions with known platforms list
        var fullExcludeList = excludeList.slice();
        if (excludeList.length > 0) {
            // If the API detected platforms, also add common automation/integration tools
            knownPlatforms.forEach(function (p) {
                if (fullExcludeList.indexOf(p) === -1) fullExcludeList.push(p);
            });
        }
        var compMap = {};
        var compDisplay = {};
        results.forEach(function (r) {
            r.competitors.forEach(function (c) {
                // Skip if this name matches a platform/tool the company works with
                var cLower = c.toLowerCase();
                var compLower = company.toLowerCase();
                var isSelf = cLower === compLower || cLower.indexOf(compLower) !== -1 || compLower.indexOf(cLower) !== -1;
                var isExcluded = fullExcludeList.some(function (ex) {
                    return cLower === ex || cLower.indexOf(ex) !== -1 || ex.indexOf(cLower) !== -1;
                });
                if (!isSelf && !isExcluded) {
                    compMap[cLower] = (compMap[cLower] || 0) + 1;
                    // Keep the version with more uppercase letters as display name
                    if (!compDisplay[cLower] || c.replace(/[^A-Z]/g, "").length > compDisplay[cLower].replace(/[^A-Z]/g, "").length) {
                        compDisplay[cLower] = c;
                    }
                }
            });
        });
        var sorted = Object.entries(compMap)
            .sort(function (a, b) { return b[1] - a[1]; })
            .slice(0, 8)
            .map(function (entry) { return compDisplay[entry[0]]; });

        // Show results
        showResults(company, industry, score, found, results.length - found, results, sorted);
    });

    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function updateScanStep(steps, currentIndex) {
        for (var i = 0; i < steps.length; i++) {
            var indicator = steps[i].querySelector(".scan-step-indicator");
            var label = steps[i].querySelector("span");
            if (i < currentIndex) {
                indicator.className = "scan-step-indicator done";
                indicator.innerHTML = '<span class="scan-check">✓</span>';
                label.style.color = "var(--accent)";
            } else if (i === currentIndex) {
                indicator.className = "scan-step-indicator active";
                indicator.innerHTML = '<div class="scan-dot"></div>';
                label.style.color = "var(--accent)";
            } else {
                indicator.className = "scan-step-indicator pending";
                indicator.innerHTML = "";
                label.style.color = "var(--text-muted)";
            }
        }
    }

    function markStepDone(steps, index) {
        var indicator = steps[index].querySelector(".scan-step-indicator");
        var label = steps[index].querySelector("span");
        indicator.className = "scan-step-indicator done";
        indicator.innerHTML = '<span class="scan-check">✓</span>';
        label.style.color = "var(--accent)";
    }

    function showResults(company, industry, score, found, missed, results, competitors) {
        scanPhase.style.display = "none";
        resultsPhase.style.display = "block";

        // Company info
        document.getElementById("resultsCompanyInfo").textContent = industry ? company + " · " + industry : company;

        // Score ring
        var scoreColor = score === 0 ? "#ff3b5c" : score < 30 ? "#ff6b35" : score < 60 ? "#ffc107" : "#00e5a0";
        var arc = document.getElementById("scoreArc");
        var circ = 2 * Math.PI * 72;
        var offset = circ - (score / 100) * circ;
        arc.setAttribute("stroke", scoreColor);
        setTimeout(function () { arc.setAttribute("stroke-dashoffset", offset); }, 100);

        document.getElementById("scoreNumber").textContent = score;
        document.getElementById("scoreNumber").style.color = scoreColor;

        var scoreLabel = score === 0 ? "Invisible to AI" : score < 20 ? "Barely Visible" : score < 50 ? "Low Visibility" : score < 75 ? "Moderate Visibility" : "Strong Visibility";
        var scoreLabelEl = document.getElementById("scoreLabel");
        scoreLabelEl.textContent = scoreLabel;
        scoreLabelEl.style.color = score === 0 ? "#ff3b5c" : score < 30 ? "#ff6b35" : "#00e5a0";

        var scoreDesc = score === 0
            ? "AI platforms don't mention your company at all. Your competitors are capturing this demand instead."
            : score < 50
            ? "You're appearing in some AI results, but competitors dominate most queries in your space."
            : "You have solid AI visibility. Let's optimize to capture even more demand.";
        document.getElementById("scoreDesc").textContent = scoreDesc;

        // Stats
        document.getElementById("statPrompts").textContent = results.length;
        document.getElementById("statFound").textContent = found;
        document.getElementById("statMissed").textContent = missed;

        // Competitors
        if (competitors.length > 0) {
            var compSection = document.getElementById("competitorsSection");
            compSection.style.display = "block";
            var compList = document.getElementById("competitorsList");
            compList.innerHTML = "";
            competitors.forEach(function (c) {
                var span = document.createElement("span");
                span.className = "competitor-tag";
                span.textContent = c;
                compList.appendChild(span);
            });
        }

        // Prompt results
        var promptContainer = document.getElementById("promptResults");
        promptContainer.innerHTML = "";
        results.forEach(function (r) {
            var card = document.createElement("div");
            card.className = "prompt-card";

            var header = '<div class="prompt-card-header">' +
                '<span class="prompt-platform">' + r.platform + '</span>' +
                '<span class="prompt-status ' + (r.found ? 'found' : 'not-found') + '">' + (r.found ? 'Found' : 'Not Found') + '</span>' +
                '</div>';

            var truncated = r.answer && r.answer.length > 150 ? r.answer.slice(0, 150) + "..." : r.answer;
            var hasMore = r.answer && r.answer.length > 150;

            var body = '<p class="prompt-question">"' + escapeHtml(r.prompt) + '"</p>' +
                '<p class="prompt-answer" data-full="' + escapeAttr(r.answer) + '">' + escapeHtml(truncated) + '</p>';

            if (hasMore) {
                body += '<button class="prompt-toggle" data-de="Vollständige Antwort lesen">Read full response</button>';
            }

            if (r.competitors.length > 0) {
                body += '<div class="prompt-competitors">';
                r.competitors.forEach(function (c) {
                    body += '<span class="prompt-comp-tag">' + escapeHtml(c) + '</span>';
                });
                body += '</div>';
            }

            card.innerHTML = header + body;
            promptContainer.appendChild(card);
        });

        // Toggle full response
        promptContainer.querySelectorAll('.prompt-toggle').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var answerEl = btn.parentElement.querySelector('.prompt-answer');
                var full = answerEl.getAttribute('data-full');
                if (btn.classList.contains('expanded')) {
                    answerEl.textContent = full.slice(0, 150) + '...';
                    btn.textContent = 'Read full response';
                    btn.classList.remove('expanded');
                } else {
                    answerEl.textContent = full;
                    btn.textContent = 'Show less';
                    btn.classList.add('expanded');
                }
            });
        });

        // Assessment
        var assessText = company + " currently has " + (score === 0 ? "zero" : "limited") + " visibility in general English-language AI commercial queries.";
        if (score === 0) {
            assessText += " While " + company + " may have a presence in specific regional or niche contexts, it does not appear in global AI recommendations which are dominated by massive B2B platforms and world-renowned brands.";
        } else if (score > 0 && score < 50) {
            assessText += " There's room to significantly improve how AI platforms reference and recommend " + company + " to potential customers.";
        }
        document.getElementById("assessmentText").textContent = assessText;

        // Run another
        document.getElementById("runAnotherBtn").addEventListener("click", function () {
            resultsPhase.style.display = "none";
            formPhase.style.display = "block";
            companyInput.value = "";
            websiteInput.value = "";
            industryInput.value = "";
            runAuditBtn.disabled = true;

            // Reset scan steps
            var steps = scanPhase.querySelectorAll(".scan-step");
            steps.forEach(function (step) {
                var indicator = step.querySelector(".scan-step-indicator");
                indicator.className = "scan-step-indicator pending";
                indicator.innerHTML = "";
                step.querySelector("span").style.color = "var(--text-muted)";
            });

            // Reset score ring
            document.getElementById("scoreArc").setAttribute("stroke-dashoffset", "452.39");

            // Reset competitors
            document.getElementById("competitorsSection").style.display = "none";

            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    function escapeHtml(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function escapeAttr(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
})();
