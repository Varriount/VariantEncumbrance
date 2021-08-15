/**
 * Author: Vanir#0001 (Discord) | github.com/VanirDev
 * Software License: Creative Commons Attributions International License
 */
// Import JavaScript modules
import { VARIANT_ENCUMBRANCE_INVENTORY_PLUS_MODULE_NAME, VARIANT_ENCUMBRANCE_MIDI_QOL_MODULE_NAME, VARIANT_ENCUMBRANCE_MODULE_NAME, getGame, VARIANT_ENCUMBRANCE_FLAG } from "./settings.js";
import { log } from "../VariantEncumbrance.js";
import Effect from "./Effect.js";
/* ------------------------------------ */
/* Constants         					*/
/* ------------------------------------ */
export const ENCUMBRANCE_TIERS = {
    NONE: 0,
    LIGHT: 1,
    HEAVY: 2,
    MAX: 3,
};
export const ENCUMBRANCE_STATE = {
    UNENCUMBERED: "Unencumbered",
    ENCUMBERED: "Encumbered",
    HEAVILY_ENCUMBERED: "Heavily Encumbered",
    OVERBURDENED: "Overburdened"
};
export const VariantEncumbranceImpl = {
    veItem: function (item) {
        return {
            _id: item._id,
            weight: item.data.weight,
            count: item.data.quantity,
            totalWeight: item.data.weight * item.data.quantity,
            proficient: item.data.proficient,
            equipped: item.data.equipped
        };
    },
    veItemString: function (item) {
        return {
            _id: item._id,
            weight: item['data.weight'],
            count: item['data.quantity'],
            totalWeight: item['data.weight'] * item['data.quantity'],
            proficient: item['data.proficient'],
            equipped: item['data.equipped']
        };
    },
    veEffect: function (effect) {
        let result = {
            multiply: [],
            add: []
        };
        if (!effect.disabled && effect.changes) {
            effect.changes.forEach(change => {
                if (change.key === "data.attributes.encumbrance.value") {
                    if (change.mode == 1) {
                        result.multiply.push(change.value);
                    }
                    else if (change.mode == 2) {
                        result.add.push(change.value);
                    }
                }
            });
        }
        return result;
    },
    convertItemSet: function (actorEntity) {
        let itemSet = {};
        const weightlessCategoryIds = [];
        const scopes = getGame().getPackageScopes();
        // Check for inventory-plus module
        const invPlusActive = getGame().modules.get(VARIANT_ENCUMBRANCE_INVENTORY_PLUS_MODULE_NAME)?.active;
        const hasInvPlus = scopes.includes(VARIANT_ENCUMBRANCE_INVENTORY_PLUS_MODULE_NAME);
        if (hasInvPlus && invPlusActive) {
            const inventoryPlusCategories = actorEntity.getFlag(VARIANT_ENCUMBRANCE_INVENTORY_PLUS_MODULE_NAME, 'category');
            if (inventoryPlusCategories) {
                for (const categoryId in inventoryPlusCategories) {
                    if (inventoryPlusCategories[categoryId]?.ownWeight != 0) {
                        itemSet["i+" + categoryId] = {
                            _id: "i+" + categoryId,
                            totalWeight: inventoryPlusCategories[categoryId]?.ownWeight
                        };
                    }
                    if (inventoryPlusCategories.hasOwnProperty(categoryId) && inventoryPlusCategories[categoryId]?.ignoreWeight) {
                        weightlessCategoryIds.push(categoryId);
                    }
                }
            }
        }
        actorEntity.items.forEach((item) => {
            //@ts-ignore
            const hasWeight = !!item.data.data.weight;
            const category = item.getFlag(VARIANT_ENCUMBRANCE_INVENTORY_PLUS_MODULE_NAME, 'category');
            const isNotInWeightlessCategory = hasInvPlus && invPlusActive ? weightlessCategoryIds.indexOf(category) < 0 : true;
            if (hasWeight && isNotInWeightlessCategory) {
                itemSet[item.data._id] = VariantEncumbranceImpl.veItem(item.data);
            }
        });
        return itemSet;
    },
    convertEffectSet: function (actorEntity) {
        let result = {};
        actorEntity.effects.forEach(effect => {
            result[effect.data._id] = VariantEncumbranceImpl.veEffect(effect.data);
        });
        return result;
    },
    updateEncumbrance: async function (actorEntity, updatedItems, updatedEffect, mode) {
        //getGame().actors?.get(<string>actorEntity.data._id)?.data.type !== "character" || 
        if (!getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "enabled")) {
            if (hasProperty(actorEntity.data, 'flags.' + VARIANT_ENCUMBRANCE_FLAG)) {
                actorEntity.unsetFlag(VARIANT_ENCUMBRANCE_MODULE_NAME, VARIANT_ENCUMBRANCE_FLAG);
            }
            return;
        }
        if (updatedItems && updatedItems?.length > 1) {
            throw new Error("Variant encumbrance not work with multiple item");
        }
        const itemSet = VariantEncumbranceImpl.convertItemSet(actorEntity);
        const updatedItem = updatedItems ? updatedItems[0] : undefined;
        if (updatedItem) {
            // On update operations, the actorEntity's items have not been updated.
            // Override the entry for this item using the updatedItem data.
            if (Object.keys(updatedItem).indexOf('data.weight') !== -1) {
                //@ts-ignore
                if (mode == "add" && !!updatedItem['data.weight'] && updatedItem['data.weight'] > 0) { // dirty fix https://github.com/VanirDev/VariantEncumbrance/issues/34
                    //@ts-ignore
                    itemSet[updatedItem._id] = VariantEncumbranceImpl.veItemString(updatedItem);
                }
                else if (mode == "delete") {
                    //@ts-ignore
                    delete itemSet[updatedItem._id];
                }
            }
            else {
                //@ts-ignore
                if (mode == "add" && !!updatedItem.data.weight && updatedItem.data.weight > 0) { // dirty fix https://github.com/VanirDev/VariantEncumbrance/issues/34
                    //@ts-ignore
                    itemSet[updatedItem._id] = VariantEncumbranceImpl.veItem(updatedItem);
                }
                else if (mode == "delete") {
                    if (typeof updatedItem === 'string' || updatedItem instanceof String) {
                        //@ts-ignore
                        delete itemSet[updatedItem];
                    }
                    else {
                        //@ts-ignore
                        delete itemSet[updatedItem._id];
                    }
                }
            }
        }
        const effectSet = VariantEncumbranceImpl.convertEffectSet(actorEntity);
        if (updatedEffect) {
            // On update operations, the actorEntity's effects have not been updated.
            // Override the entry for this effect using the updatedActiveEffect data.
            if (mode == "add") {
                //@ts-ignore
                effectSet[updatedEffect.data._id] = VariantEncumbranceImpl.veEffect(updatedEffect);
            }
            else if (mode == "delete") {
                if (typeof updatedEffect === 'string' || updatedEffect instanceof String) {
                    //@ts-ignore
                    delete itemSet[updatedEffect];
                }
                else {
                    //@ts-ignore
                    delete effectSet[updatedEffect.data._id];
                }
            }
        }
        let encumbranceData = VariantEncumbranceImpl.calculateEncumbrance(actorEntity, itemSet, effectSet);
        let effectEntityPresent;
        for (const effectEntity of actorEntity.effects) {
            const effectNameToSet = effectEntity.name ? effectEntity.name : effectEntity.data.label;
            if (!effectNameToSet) {
                continue;
            }
            if (typeof effectEntity.getFlag(VARIANT_ENCUMBRANCE_MODULE_NAME, 'tier') === 'number') {
                if (!effectEntityPresent && effectEntity?.data?.label) {
                    effectEntityPresent = effectEntity;
                }
                else {
                    // Cannot have more than one effect tier present at any one time
                    if (await VariantEncumbranceImpl.hasEffectApplied(effectNameToSet, actorEntity)) {
                        await VariantEncumbranceImpl.removeEffect(effectNameToSet, actorEntity);
                    }
                }
            }
            else if (effectEntity.getFlag(VARIANT_ENCUMBRANCE_MODULE_NAME, 'tier')) {
                if (!effectEntityPresent && effectEntity?.data?.label) {
                    effectEntityPresent = effectEntity;
                }
                else {
                    // Cannot have more than one effect tier present at any one time
                    if (await VariantEncumbranceImpl.hasEffectApplied(effectNameToSet, actorEntity)) {
                        await VariantEncumbranceImpl.removeEffect(effectNameToSet, actorEntity);
                    }
                }
            }
            else {
                // We shouldn't go here never!!!
                if (effectEntityPresent && effectEntity?.data?.label) {
                    if (effectNameToSet === ENCUMBRANCE_STATE.UNENCUMBERED
                        || effectNameToSet === ENCUMBRANCE_STATE.ENCUMBERED
                        || effectNameToSet === ENCUMBRANCE_STATE.HEAVILY_ENCUMBERED
                        || effectNameToSet === ENCUMBRANCE_STATE.OVERBURDENED) {
                        if (!effectEntityPresent) {
                            effectEntityPresent = effectEntity;
                        }
                        else {
                            if (await VariantEncumbranceImpl.hasEffectApplied(effectNameToSet, actorEntity)) {
                                await VariantEncumbranceImpl.removeEffect(effectNameToSet, actorEntity);
                            }
                        }
                    }
                }
            }
        }
        let effectName;
        switch (encumbranceData.encumbranceTier) {
            case ENCUMBRANCE_TIERS.NONE:
                effectName = ENCUMBRANCE_STATE.UNENCUMBERED;
                break;
            case ENCUMBRANCE_TIERS.LIGHT:
                effectName = ENCUMBRANCE_STATE.ENCUMBERED;
                break;
            case ENCUMBRANCE_TIERS.HEAVY:
                effectName = ENCUMBRANCE_STATE.HEAVILY_ENCUMBERED;
                break;
            case ENCUMBRANCE_TIERS.MAX:
                effectName = ENCUMBRANCE_STATE.OVERBURDENED;
                break;
            default:
                return;
        }
        if (!getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "useVariantEncumbrance")) {
            effectName = ENCUMBRANCE_STATE.UNENCUMBERED;
        }
        // Skip if name is the same.
        if (effectName === effectEntityPresent?.data.label) {
            return;
        }
        let origin = `Actor.${actorEntity.data._id}`;
        await VariantEncumbranceImpl.addEffect(effectName, actorEntity, origin, encumbranceData);
        // SEEM NOT NECESSARY
        const tier = actorEntity.getFlag(VARIANT_ENCUMBRANCE_FLAG, 'tier') || {};
        const weight = actorEntity.getFlag(VARIANT_ENCUMBRANCE_FLAG, 'weight') || {};
        // const speed = actorEntity.getFlag(VARIANT_ENCUMBRANCE_FLAG,'speed') || {};
        const burrow = actorEntity.getFlag(VARIANT_ENCUMBRANCE_FLAG, 'burrow') || {};
        const climb = actorEntity.getFlag(VARIANT_ENCUMBRANCE_FLAG, 'climb') || {};
        const fly = actorEntity.getFlag(VARIANT_ENCUMBRANCE_FLAG, 'fly') || {};
        const swim = actorEntity.getFlag(VARIANT_ENCUMBRANCE_FLAG, 'swim') || {};
        const walk = actorEntity.getFlag(VARIANT_ENCUMBRANCE_FLAG, 'walk') || {};
        if (tier !== encumbranceData.encumbranceTier) {
            actorEntity.setFlag(VARIANT_ENCUMBRANCE_MODULE_NAME, "tier", encumbranceData.encumbranceTier);
        }
        if (weight !== encumbranceData.totalWeight) {
            actorEntity.setFlag(VARIANT_ENCUMBRANCE_MODULE_NAME, "weight", encumbranceData.totalWeight);
        }
        // //@ts-ignore
        // if (speed !== actorEntity.data.data.attributes.movement.walk) {
        // 	//@ts-ignore
        // 	actorEntity.setFlag(VARIANT_ENCUMBRANCE_MODULE_NAME, "speed", actorEntity.data.data.attributes.movement.walk);
        // }
        //@ts-ignore
        if (burrow !== actorEntity.data.data.attributes.movement.burrow) {
            //@ts-ignore
            actorEntity.setFlag(VARIANT_ENCUMBRANCE_MODULE_NAME, "burrow", actorEntity.data.data.attributes.movement.burrow);
        }
        //@ts-ignore
        if (climb !== actorEntity.data.data.attributes.movement.climb) {
            //@ts-ignore
            actorEntity.setFlag(VARIANT_ENCUMBRANCE_MODULE_NAME, "climb", actorEntity.data.data.attributes.movement.climb);
        }
        //@ts-ignore
        if (fly !== actorEntity.data.data.attributes.movement.fly) {
            //@ts-ignore
            actorEntity.setFlag(VARIANT_ENCUMBRANCE_MODULE_NAME, "fly", actorEntity.data.data.attributes.movement.fly);
        }
        //@ts-ignore
        if (swim !== actorEntity.data.data.attributes.movement.swim) {
            //@ts-ignore
            actorEntity.setFlag(VARIANT_ENCUMBRANCE_MODULE_NAME, "swim", actorEntity.data.data.attributes.movement.swim);
        }
        //@ts-ignore
        if (walk !== actorEntity.data.data.attributes.movement.walk) {
            //@ts-ignore
            actorEntity.setFlag(VARIANT_ENCUMBRANCE_MODULE_NAME, "walk", actorEntity.data.data.attributes.movement.walk);
        }
        // FINAL SET ENCUMBRANCE ????
        // data.data.attributes.encumbrance {
        // 	"value": null,
        // 	"max": null,
        // 	"pct": null,
        // 	"encumbered": false
        // }
    },
    calculateEncumbrance: function (actorEntity, itemSet, effectSet) {
        if (actorEntity.data.type !== "character") {
            log("ERROR: NOT A CHARACTER");
            return null;
        }
        if (itemSet === null || itemSet === undefined) {
            itemSet = VariantEncumbranceImpl.convertItemSet(actorEntity);
        }
        if (effectSet === null || effectSet === undefined) {
            effectSet = VariantEncumbranceImpl.convertEffectSet(actorEntity);
        }
        let speedDecrease = 0;
        let totalWeight = 0;
        let strengthScore = actorEntity.data.data.abilities.str.value;
        if (getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "sizeMultipliers")) {
            const size = actorEntity.data.data.traits.size;
            if (size === "tiny") {
                strengthScore /= 2;
            }
            else if (size === "lg") {
                strengthScore *= 2;
            }
            else if (size === "huge") {
                strengthScore *= 4;
            }
            else if (size === "grg") {
                strengthScore *= 8;
            }
            else {
                strengthScore *= 1;
            }
            // Powerful build support
            if (actorEntity.data?.flags?.dnd5e?.powerfulBuild) { //jshint ignore:line
                strengthScore *= 2;
            }
        }
        const lightMax = getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "lightMultiplier") * strengthScore;
        const mediumMax = getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "mediumMultiplier") * strengthScore;
        const heavyMax = getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "heavyMultiplier") * strengthScore;
        Object.values(itemSet).forEach((item) => {
            let appliedWeight = item.totalWeight;
            if (item.equipped) {
                if (item.proficient) {
                    appliedWeight *= getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "profEquippedMultiplier");
                }
                else {
                    appliedWeight *= getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "equippedMultiplier");
                }
            }
            else {
                if (!item._id.startsWith("i+")) {
                    appliedWeight *= getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "unequippedMultiplier");
                }
            }
            totalWeight += appliedWeight;
        });
        if (getGame().settings.get("dnd5e", "currencyWeight")) {
            let totalCoins = 0;
            Object.values(actorEntity.data.data.currency).forEach(count => {
                totalCoins += count;
            });
            totalWeight += totalCoins / getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "currencyWeight");
        }
        let weightMultipliers = [];
        let weightAdds = [];
        Object.values(effectSet).forEach((effect) => {
            weightMultipliers = weightMultipliers.concat(effect.multiply);
            weightAdds = weightAdds.concat(effect.add);
        });
        weightMultipliers.forEach(multiplier => {
            totalWeight *= multiplier;
        });
        weightAdds.forEach(add => {
            totalWeight += add;
        });
        let encumbranceTier = ENCUMBRANCE_TIERS.NONE;
        if (totalWeight >= lightMax && totalWeight < mediumMax) {
            speedDecrease = getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "lightWeightDecrease");
            encumbranceTier = ENCUMBRANCE_TIERS.LIGHT;
        }
        if (totalWeight >= mediumMax && totalWeight < heavyMax) {
            speedDecrease = getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "heavyWeightDecrease");
            encumbranceTier = ENCUMBRANCE_TIERS.HEAVY;
        }
        if (totalWeight >= heavyMax) {
            encumbranceTier = ENCUMBRANCE_TIERS.MAX;
        }
        return {
            totalWeight: totalWeight,
            lightMax: lightMax,
            mediumMax: mediumMax,
            heavyMax: heavyMax,
            encumbranceTier: encumbranceTier,
            speedDecrease: speedDecrease
        };
    },
    /**
     * Adds dynamic effects for specific effects
     *
     * @param {Effect} effect - the effect to handle
     * @param {Actor5e} actor - the effected actor
     */
    addDynamicEffects: async function (effectName, actor) {
        const invMidiQol = getGame().modules.get(VARIANT_ENCUMBRANCE_MIDI_QOL_MODULE_NAME)?.active;
        switch (effectName.toLowerCase()) {
            case ENCUMBRANCE_STATE.ENCUMBERED.toLowerCase():
                {
                    if (await VariantEncumbranceImpl.hasEffectApplied(ENCUMBRANCE_STATE.HEAVILY_ENCUMBERED, actor)) {
                        await VariantEncumbranceImpl.removeEffect(ENCUMBRANCE_STATE.HEAVILY_ENCUMBERED, actor);
                    }
                    if (await VariantEncumbranceImpl.hasEffectApplied(ENCUMBRANCE_STATE.OVERBURDENED, actor)) {
                        await VariantEncumbranceImpl.removeEffect(ENCUMBRANCE_STATE.OVERBURDENED, actor);
                    }
                    let effect = VariantEncumbranceImpl._encumbered();
                    VariantEncumbranceImpl._addEncumbranceEffects({ effect, actor, value: 10 });
                    return effect;
                }
            case ENCUMBRANCE_STATE.HEAVILY_ENCUMBERED.toLowerCase():
                {
                    if (await VariantEncumbranceImpl.hasEffectApplied(ENCUMBRANCE_STATE.ENCUMBERED, actor)) {
                        await VariantEncumbranceImpl.removeEffect(ENCUMBRANCE_STATE.ENCUMBERED, actor);
                    }
                    if (await VariantEncumbranceImpl.hasEffectApplied(ENCUMBRANCE_STATE.OVERBURDENED, actor)) {
                        await VariantEncumbranceImpl.removeEffect(ENCUMBRANCE_STATE.OVERBURDENED, actor);
                    }
                    let effect;
                    if (invMidiQol) {
                        effect = VariantEncumbranceImpl._heavilyEncumbered();
                    }
                    else {
                        effect = VariantEncumbranceImpl._heavilyEncumberedNoMidi();
                    }
                    VariantEncumbranceImpl._addEncumbranceEffects({ effect, actor, value: 20 });
                    return effect;
                }
            case ENCUMBRANCE_STATE.UNENCUMBERED.toLowerCase():
                {
                    if (await VariantEncumbranceImpl.hasEffectApplied(ENCUMBRANCE_STATE.ENCUMBERED, actor)) {
                        await VariantEncumbranceImpl.removeEffect(ENCUMBRANCE_STATE.ENCUMBERED, actor);
                    }
                    if (await VariantEncumbranceImpl.hasEffectApplied(ENCUMBRANCE_STATE.HEAVILY_ENCUMBERED, actor)) {
                        await VariantEncumbranceImpl.removeEffect(ENCUMBRANCE_STATE.HEAVILY_ENCUMBERED, actor);
                    }
                    if (await VariantEncumbranceImpl.hasEffectApplied(ENCUMBRANCE_STATE.OVERBURDENED, actor)) {
                        await VariantEncumbranceImpl.removeEffect(ENCUMBRANCE_STATE.OVERBURDENED, actor);
                    }
                    return null;
                }
            case ENCUMBRANCE_STATE.OVERBURDENED.toLowerCase():
                {
                    if (await VariantEncumbranceImpl.hasEffectApplied(ENCUMBRANCE_STATE.ENCUMBERED, actor)) {
                        await VariantEncumbranceImpl.removeEffect(ENCUMBRANCE_STATE.ENCUMBERED, actor);
                    }
                    if (await VariantEncumbranceImpl.hasEffectApplied(ENCUMBRANCE_STATE.HEAVILY_ENCUMBERED, actor)) {
                        await VariantEncumbranceImpl.removeEffect(ENCUMBRANCE_STATE.HEAVILY_ENCUMBERED, actor);
                    }
                    let effect;
                    if (invMidiQol) {
                        effect = VariantEncumbranceImpl._overburdenedEncumbered();
                    }
                    else {
                        effect = VariantEncumbranceImpl._overburdenedEncumberedNoMidi();
                    }
                    VariantEncumbranceImpl._addEncumbranceEffectsOverburdened({ effect, actor });
                    return effect;
                }
            default: {
                throw new Error("The effect name '" + effectName + "' is not reconized");
            }
        }
    },
    _encumbered: function () {
        return new Effect({
            name: ENCUMBRANCE_STATE.ENCUMBERED,
            description: 'Lowers movement by 10 ft.',
            icon: 'icons/svg/down.svg',
            isDynamic: true,
        });
    },
    _heavilyEncumbered: function () {
        return new Effect({
            name: ENCUMBRANCE_STATE.HEAVILY_ENCUMBERED,
            description: 'Lowers movement by 20 ft., disadvantage on all attack rolls, and disadvantage on strength, dexterity, and constitution saves',
            icon: 'icons/svg/downgrade.svg',
            isDynamic: true,
            changes: [
                {
                    key: 'flags.midi-qol.disadvantage.attack.all',
                    mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
                    value: '1',
                },
                {
                    key: 'flags.midi-qol.disadvantage.ability.save.str',
                    mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
                    value: '1',
                },
                {
                    key: 'flags.midi-qol.disadvantage.ability.save.dex',
                    mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
                    value: '1',
                },
                {
                    key: 'flags.midi-qol.disadvantage.ability.save.con',
                    mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
                    value: '1',
                },
            ],
        });
    },
    _heavilyEncumberedNoMidi: function () {
        return new Effect({
            name: ENCUMBRANCE_STATE.HEAVILY_ENCUMBERED,
            description: 'Lowers movement by 20 ft.',
            icon: 'icons/svg/downgrade.svg',
            isDynamic: true,
            changes: [],
        });
    },
    _overburdenedEncumbered: function () {
        return new Effect({
            name: ENCUMBRANCE_STATE.OVERBURDENED,
            description: 'Lowers movement to 0 ft., disadvantage on all attack rolls, and disadvantage on strength, dexterity, and constitution saves',
            // icon: 'icons/svg/hazard.svg',
            icon: 'icons/tools/smithing/anvil.webp',
            isDynamic: true,
            changes: [
                {
                    key: 'flags.midi-qol.disadvantage.attack.all',
                    mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
                    value: '1',
                },
                {
                    key: 'flags.midi-qol.disadvantage.ability.save.str',
                    mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
                    value: '1',
                },
                {
                    key: 'flags.midi-qol.disadvantage.ability.save.dex',
                    mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
                    value: '1',
                },
                {
                    key: 'flags.midi-qol.disadvantage.ability.save.con',
                    mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
                    value: '1',
                },
            ],
        });
    },
    _overburdenedEncumberedNoMidi: function () {
        return new Effect({
            name: ENCUMBRANCE_STATE.OVERBURDENED,
            description: 'Lowers movement to 0 ft.',
            // icon: 'icons/svg/hazard.svg',
            icon: 'icons/tools/smithing/anvil.webp',
            isDynamic: true,
            changes: [],
        });
    },
    _addEncumbranceEffects: function ({ effect, actor, value }) {
        const movement = actor.data.data.attributes.movement;
        effect.changes.push({
            key: 'data.attributes.movement.burrow',
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: movement.burrow > value ? `-${value}` : `-${movement.burrow}`,
        });
        effect.changes.push({
            key: 'data.attributes.movement.climb',
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: movement.climb > value ? `-${value}` : `-${movement.climb}`,
        });
        effect.changes.push({
            key: 'data.attributes.movement.fly',
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: movement.fly > value ? `-${value}` : `-${movement.fly}`,
        });
        effect.changes.push({
            key: 'data.attributes.movement.swim',
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: movement.swim > value ? `-${value}` : `-${movement.swim}`,
        });
        effect.changes.push({
            key: 'data.attributes.movement.walk',
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: movement.walk > value ? `-${value}` : `-${movement.walk}`,
        });
    },
    _addEncumbranceEffectsOverburdened: function ({ effect, actor }) {
        const movement = actor.data.data.attributes.movement;
        effect.changes.push({
            key: 'data.attributes.movement.burrow',
            mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
            value: "0",
        });
        effect.changes.push({
            key: 'data.attributes.movement.climb',
            mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
            value: "0",
        });
        effect.changes.push({
            key: 'data.attributes.movement.fly',
            mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
            value: "0",
        });
        effect.changes.push({
            key: 'data.attributes.movement.swim',
            mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
            value: "0",
        });
        effect.changes.push({
            key: 'data.attributes.movement.walk',
            mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
            value: "0",
        });
    },
    /**
     * Checks to see if any of the current active effects applied to the actor
     * with the given UUID match the effect name and are a convenient effect
     *
     * @param {string} effectName - the name of the effect to check
     * @param {string} uuid - the uuid of the actor to see if the effect is
     * applied to
     * @returns {boolean} true if the effect is applied, false otherwise
     */
    async hasEffectApplied(effectName, actor) {
        // const actor = await this._foundryHelpers.getActorByUuid(uuid);
        return actor?.data?.effects?.some((activeEffect) => activeEffect?.data?.flags?.isConvenient &&
            activeEffect?.data?.label == effectName);
    },
    /**
     * Removes the effect with the provided name from an actor matching the
     * provided UUID
     *
     * @param {string} effectName - the name of the effect to remove
     * @param {string} uuid - the uuid of the actor to remove the effect from
     */
    async removeEffect(effectName, actor) {
        // const actor = await this._foundryHelpers.getActorByUuid(uuid);
        const effectToRemove = actor.data.effects.find((activeEffect) => activeEffect?.data?.flags?.isConvenient &&
            activeEffect?.data?.label == effectName);
        if (effectToRemove) {
            await actor.deleteEmbeddedDocuments('ActiveEffect', [effectToRemove.id]);
            log(`Removed effect ${effectName} from ${actor.name} - ${actor.id}`);
        }
    },
    /**
     * Adds the effect with the provided name to an actor matching the provided
     * UUID
     *
     * @param {string} effectName - the name of the effect to add
     * @param {string} uuid - the uuid of the actor to add the effect to
     */
    async addEffect(effectName, actor, origin, encumbranceData) {
        // let effect = VariantEncumbranceImpl.findEffectByName(effectName);
        //const actor = await VariantEncumbranceImpl._foundryHelpers.getActorByUuid(uuid);
        // if (effect.isDynamic) {
        let effect = await VariantEncumbranceImpl.addDynamicEffects(effectName, actor);
        // }
        if (effect) {
            // VariantEncumbranceImpl._handleIntegrations(effect);
            effect.flags = {
                VariantEncumbrance: {
                    tier: encumbranceData.encumbranceTier
                }
            };
            const activeEffectData = effect.convertToActiveEffectData(origin);
            await actor.createEmbeddedDocuments('ActiveEffect', [activeEffectData]);
            log(`Added effect ${effect.name} to ${actor.name} - ${actor.id}`);
        }
    }
};
