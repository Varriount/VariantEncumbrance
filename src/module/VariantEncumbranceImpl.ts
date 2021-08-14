/**
 * Author: Vanir#0001 (Discord) | github.com/VanirDev
 * Software License: Creative Commons Attributions International License
 */

// Import JavaScript modules
import { VARIANT_ENCUMBRANCE_INVENTORY_PLUS_MODULE_NAME, VARIANT_ENCUMBRANCE_MIDI_QOL_MODULE_NAME, registerSettings, VARIANT_ENCUMBRANCE_MODULE_NAME, getGame } from './settings';
import { preloadTemplates } from './preloadTemplates';
//@ts-ignore
import { DND5E } from '../../../systems/dnd5e/module/config';
import { log } from '../VariantEncumbrance';
import { VariantEncumbranceEffectData, VariantEncumbranceItemData } from './VariantEncumbranceModels';
import Effect from './Effect';

/* ------------------------------------ */
/* Constants         					*/
/* ------------------------------------ */
export const ENCUMBRANCE_TIERS = {
	NONE: 0,
	LIGHT: 1,
	HEAVY: 2,
	MAX: 3,
};


export const VariantEncumbranceImpl = {

	veItem : function(item:any):VariantEncumbranceItemData {
		return {
			_id: item._id,
			weight: item.data.weight,
			count: item.data.quantity,
			totalWeight: item.data.weight * item.data.quantity,
			proficient: item.data.proficient,
			equipped: item.data.equipped
		}
	},

	veEffect : function(effect) {
		let result:VariantEncumbranceEffectData = {
			multiply: [],
			add: []
		}

		if (!effect.disabled) {
			effect.changes.forEach(change => {
				if (change.key === "data.attributes.encumbrance.value") {
					if (change.mode == 1) {
						result.multiply.push(Number(change.value));
					} else if (change.mode == 2) {
						result.add.push(Number(<number>change.value));
					}
				}
			});
		}
		return result;
	},

	convertItemSet : function(actorEntity) {
		let itemSet:any = {};
		const weightlessCategoryIds:string[] = [];
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
		actorEntity.items.forEach((item:Item) => {
			//@ts-ignore
			const hasWeight = !!item.data.data.weight;
			const category:string = <string>item.getFlag(VARIANT_ENCUMBRANCE_INVENTORY_PLUS_MODULE_NAME, 'category');
			const isNotInWeightlessCategory = hasInvPlus && invPlusActive ? weightlessCategoryIds.indexOf(category) < 0 : true;
			if (hasWeight && isNotInWeightlessCategory) {
				itemSet[<string>item.data._id] = VariantEncumbranceImpl.veItem(item.data);
			}
		});

		return itemSet;
	},

	convertEffectSet : function(actorEntity) {
		let result = {}
		actorEntity.effects.forEach(effect => {
			result[effect.data._id] = VariantEncumbranceImpl.veEffect(effect.data);
		})
		return result;
	},

	updateEncumbrance : async function (actorEntity:Actor, updatedItem:any, updatedEffect:any, mode:string) {
		if (getGame().actors?.get(<string>actorEntity.data._id)?.data.type !== "character" || !getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "enabled")) {
			return;
		}
		const itemSet = VariantEncumbranceImpl.convertItemSet(actorEntity);
		if (updatedItem) {
			// On update operations, the actorEntity's items have not been updated.
			// Override the entry for this item using the updatedItem data.
			if (mode == "add" && !!updatedItem.data.weight) { // dirty fix https://github.com/VanirDev/VariantEncumbrance/issues/34
				itemSet[updatedItem.id] = VariantEncumbranceImpl.veItem(updatedItem);
			} else if (mode == "delete") {
				delete itemSet[updatedItem.id];
			}
		}

		const effectSet = VariantEncumbranceImpl.convertEffectSet(actorEntity);
		if (updatedEffect) {
			// On update operations, the actorEntity's effects have not been updated.
			// Override the entry for this effect using the updatedActiveEffect data.
			if (mode == "add") {
				effectSet[updatedEffect.data._id] = VariantEncumbranceImpl.veEffect(updatedEffect);
			} else if (mode == "delete") {
				delete effectSet[updatedEffect.id];
			}
		}
		let encumbranceData = VariantEncumbranceImpl.calculateEncumbrance(actorEntity, itemSet, effectSet);

		let effectEntityPresent:any = null;

		for (const effectEntity of actorEntity.effects) {
			if (typeof effectEntity.getFlag(VARIANT_ENCUMBRANCE_MODULE_NAME, 'tier') === 'number') {
				if (!effectEntityPresent) {
					effectEntityPresent = effectEntity;
				} else {
					// Cannot have more than one effect tier present at any one time
					log("deleting duplicate effect", effectEntity);
					await effectEntity.delete();
				}
			}
		}

		let [changeMode, changeValue] = encumbranceData.encumbranceTier >= ENCUMBRANCE_TIERS.MAX ?
			[CONST.ACTIVE_EFFECT_MODES.MULTIPLY, 0] :
			[CONST.ACTIVE_EFFECT_MODES.ADD, encumbranceData.speedDecrease * -1];

		if (!getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "useVariantEncumbrance")) {
			changeMode = CONST.ACTIVE_EFFECT_MODES.ADD;
			changeValue = 0;
		}
		let effectName;
		switch (encumbranceData.encumbranceTier) {
			case ENCUMBRANCE_TIERS.NONE:
				effectName = "Unencumbered";
				break;
			case ENCUMBRANCE_TIERS.LIGHT:
				effectName = "Encumbered";
				break;
			// case ENCUMBRANCE_TIERS.LIGHT:
			// 	effectName = "Lightly Encumbered";
			// 	break;
			case ENCUMBRANCE_TIERS.HEAVY:
				effectName = "Heavily Encumbered";
				break
			case ENCUMBRANCE_TIERS.MAX:
				effectName = "Overburdened";
				break;
			default:
				return;
		}

		// Skip if name is the same.
		if (effectName === effectEntityPresent?.data.label) {
			return;
		}

		let movementSet = ['walk', 'swim', 'fly', 'climb', 'burrow'];
		//@ts-ignore
		if (actorEntity.data?.data?.attributes?.movement) {
			movementSet = [];
			//@ts-ignore
			Object.entries(actorEntity.data?.data?.attributes?.movement).forEach((speed:any) => {
				if (speed[0] == "hover" || speed[0] == "units") {
					return;
				}
				if (speed[1] > 0) {
					movementSet.push(speed[0]);
				}
			});
		}
		let changes = movementSet.map((movementType) => {
			const changeKey = "data.attributes.movement." + movementType;
			return {
				key: changeKey,
				value: changeValue,
				mode: changeMode,
				priority: 1000
			};
		});
		if (encumbranceData.encumbranceTier >= 2) {
			const invMidiQol = getGame().modules.get(VARIANT_ENCUMBRANCE_MIDI_QOL_MODULE_NAME)?.active;
			//const hasMidiQol = scopes.includes(MIDI_QOL_MODULE_NAME);
			if (invMidiQol) {
			//@ts-ignore
			changes = changes.concat(['attack.mwak', 'attack.rawk', 'ability.save.con', 'ability.save.str', 'ability.save.dex', 'ability.check.con', 'ability.check.str', 'ability.check.dex'].map((mod) => {
				const changeKey = 'flags.midi-qol.disadvantage.' + mod;
				return {
				key: changeKey,
				value: 1,
				mode: 0, // should be 1 | 2
				priority: 1000
				}
			}));
			}
		}

		// let effectChange = {
		// 	disabled: encumbranceData.encumbranceTier === ENCUMBRANCE_TIERS.NONE,
		// 	label: effectName,
		// 	icon: "icons/tools/smithing/anvil.webp",
		// 	changes: changes,
		// 	flags: {
		// 		VariantEncumbrance: {
		// 			tier: encumbranceData.encumbranceTier
		// 		}
		// 	},
		// 	origin: `Actor.${actorEntity.data._id}`
		// };

		// if (effectChange) {
		// 	if (effectEntityPresent) {
		// 		await effectEntityPresent.update(effectChange);
		// 	} else {
		// 		await actorEntity.createEmbeddedEntity("ActiveEffect", effectChange);
		// 	}
		// }

		// await actorEntity.applyActiveEffects();
		//@ts-ignore
		const { speed, tier, weight } = (actorEntity.data.flags.VariantEncumbrance || {});
		//@ts-ignore
		if (speed !== actorEntity.data.data.attributes.movement.walk) {
			//@ts-ignore
			actorEntity.setFlag(VARIANT_ENCUMBRANCE_MODULE_NAME, "speed", actorEntity.data.data.attributes.movement.walk);
		}
		if (tier !== encumbranceData.encumbranceTier) {
			actorEntity.setFlag(VARIANT_ENCUMBRANCE_MODULE_NAME, "tier", encumbranceData.encumbranceTier);
		}
		if (weight !== encumbranceData.totalWeight) {
			actorEntity.setFlag(VARIANT_ENCUMBRANCE_MODULE_NAME, "weight", encumbranceData.totalWeight);
		}
	},

	calculateEncumbrance : function(actorEntity, itemSet, effectSet):any {
		if (actorEntity.data.type !== "character") {
			console.log("ERROR: NOT A CHARACTER");
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
			} else if (size === "lg") {
				strengthScore *= 2;
			} else if (size === "huge") {
				strengthScore *= 4;
			} else if (size === "grg") {
				strengthScore *= 8;
			} else {
				strengthScore *= 1;
			}

			if (actorEntity.data?.flags?.dnd5e?.powerfulBuild) { //jshint ignore:line
				strengthScore *= 2;
			}
		}
		const lightMax = <number>getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "lightMultiplier") * strengthScore;
		const mediumMax = <number>getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "mediumMultiplier") * strengthScore;
		const heavyMax = <number>getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "heavyMultiplier") * strengthScore;

		Object.values(itemSet).forEach((item:any) => {
			let appliedWeight = item.totalWeight;
			if (item.equipped) {
				if (item.proficient) {
					appliedWeight *= <number>getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "profEquippedMultiplier");
				} else {
					appliedWeight *= <number>getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "equippedMultiplier");
				}
			} else {
				if (!item._id.startsWith("i+")) {
					appliedWeight *= <number>getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "unequippedMultiplier");
				}
			}
			totalWeight += appliedWeight;
		});

		if (getGame().settings.get("dnd5e", "currencyWeight")) {
			let totalCoins = 0;
			Object.values(actorEntity.data.data.currency).forEach(count => {
				totalCoins += <number>count;
			});
			totalWeight += totalCoins / <number>getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "currencyWeight");
		}

		let weightMultipliers = [];
		let weightAdds = [];
		Object.values(effectSet).forEach((effect:any) => {
			weightMultipliers =  weightMultipliers.concat(effect.multiply);
			weightAdds =  weightAdds.concat(effect.add);
		});

		weightMultipliers.forEach(multiplier => {
			totalWeight *= multiplier;
		});
		weightAdds.forEach(add => {
			totalWeight += add
		})

		let encumbranceTier = ENCUMBRANCE_TIERS.NONE;
		if (totalWeight >= lightMax && totalWeight < mediumMax) {
			speedDecrease = <number>getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "lightWeightDecrease");
			encumbranceTier = ENCUMBRANCE_TIERS.LIGHT;
		}
		if (totalWeight >= mediumMax && totalWeight < heavyMax) {
			speedDecrease = <number>getGame().settings.get(VARIANT_ENCUMBRANCE_MODULE_NAME, "heavyWeightDecrease");
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
		}
	},

	/**
	 * Adds dynamic effects for specific effects
	 *
	 * @param {Effect} effect - the effect to handle
	 * @param {Actor5e} actor - the effected actor
	 */
	addDynamicEffects : async  function(effectName, actor):Promise<Effect|null> {
		switch (effectName.toLowerCase()) {
			case 'encumbered':	
				{
					let effect = VariantEncumbranceImpl._encumbered();
					VariantEncumbranceImpl._addEncumbranceEffects({ effect, actor, value: 10 });
					return effect;
				}
			// case 'lightly encumbered':
			// 	{
			// 		let effect = VariantEncumbranceImpl._lightlyEncumbered();
			// 		VariantEncumbranceImpl._addEncumbranceEffects({ effect, actor, value: 10 });
			// 		return effect;
			// 	}
			case 'heavily encumbered':
				{
					let effect = VariantEncumbranceImpl._heavilyEncumbered();
					VariantEncumbranceImpl._addEncumbranceEffects({ effect, actor, value: 20 });
					return effect;
				}
			case 'unencumbered':
				{
					//let effect = VariantEncumbranceImpl._unEncumbered();
					//VariantEncumbranceImpl._addEncumbranceEffects({ effect, actor, value: 0 });
					if(await VariantEncumbranceImpl.hasEffectApplied('Encumbered',actor)){
						VariantEncumbranceImpl.removeEffect('Encumbered',actor);
					}
					// if(await VariantEncumbranceImpl.hasEffectApplied('Lightly Encumbered',actor)){
					// 	VariantEncumbranceImpl.removeEffect('Lightly Encumbered',actor);
					// }
					if(await VariantEncumbranceImpl.hasEffectApplied('Heavily Encumbered',actor)){
						VariantEncumbranceImpl.removeEffect('Heavily Encumbered',actor);
					}
					if(await VariantEncumbranceImpl.hasEffectApplied('Overburdened',actor)){
						VariantEncumbranceImpl.removeEffect('Overburdened',actor);
					}
					return null;
				}
			case 'overburdened':
				{
					let effect = VariantEncumbranceImpl._overburdenedEncumbered();
					VariantEncumbranceImpl._addEncumbranceEffects({ effect, actor, value: 0 });
					return effect;
				}
			default:{
				throw new Error("The effect name '"+effectName+"' is not reconized");
			}
		}
    },

	_encumbered : function() {
		return new Effect({
			name: 'Encumbered',
			description: 'Lowers movement by 10 ft.',
			icon: 'icons/svg/down.svg',
			isDynamic: true,
		});
	},

	// _lightlyEncumbered : function() {
	// 	return new Effect({
	// 		name: 'Lightly Encumbered',
	// 		description: 'Lowers movement by 10 ft.',
	// 		icon: 'icons/svg/down.svg',
	// 		isDynamic: true,
	// 	});
	// },

	_heavilyEncumbered : function():Effect {
		return new Effect({
		name: 'Heavily Encumbered',
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

	_overburdenedEncumbered : function():Effect {
		return new Effect({
		name: 'Overburdened',
		description: 'Lowers movement to 0 ft., disadvantage on all attack rolls, and disadvantage on strength, dexterity, and constitution saves',
		icon: 'icons/svg/hazard.svg',
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

	_addEncumbranceEffects : function({ effect, actor, value }) {
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

	/**
	 * Checks to see if any of the current active effects applied to the actor
	 * with the given UUID match the effect name and are a convenient effect
	 *
	 * @param {string} effectName - the name of the effect to check
	 * @param {string} uuid - the uuid of the actor to see if the effect is
	 * applied to
	 * @returns {boolean} true if the effect is applied, false otherwise
	 */
	async hasEffectApplied(effectName, actor):Promise<boolean> {
		// const actor = await this._foundryHelpers.getActorByUuid(uuid);
		return actor?.data?.effects?.some(
			(activeEffect) =>
			activeEffect?.data?.flags?.isConvenient &&
			activeEffect?.data?.label == effectName
		);
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
		const effectToRemove = actor.data.effects.find(
			(activeEffect) =>
			activeEffect?.data?.flags?.isConvenient &&
			activeEffect?.data?.label == effectName
		);

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
	async addEffect(effectName:string, actor:Actor, origin) {
		// let effect = VariantEncumbranceImpl.findEffectByName(effectName);
		//const actor = await VariantEncumbranceImpl._foundryHelpers.getActorByUuid(uuid);
	
		// if (effect.isDynamic) {
		let effect:Effect|null = await VariantEncumbranceImpl.addDynamicEffects(effectName, actor);
		// }
		if(effect){
			// VariantEncumbranceImpl._handleIntegrations(effect);
		
			const activeEffectData = effect.convertToActiveEffectData(origin);
			await actor.createEmbeddedDocuments('ActiveEffect', [activeEffectData]);
		
			log(`Added effect ${effect.name} to ${actor.name} - ${actor.id}`);
		}
	},
	
	// _handleIntegrations(effect) {
	// 	if (this._settings.integrateWithAtl && effect.atlChanges.length > 0) {
	// 		this._addAtlChangesToEffect(effect);
	// 	}
	
	// 	if (
	// 		this._settings.integrateWithTokenMagic &&
	// 		effect.tokenMagicChanges.length > 0
	// 	) {
	// 		this._addTokenMagicChangesToEffect(effect);
	// 	}
	// },
	
	_addAtlChangesToEffect(effect) {
		effect.changes.push(...effect.atlChanges);
	},
	
	_addTokenMagicChangesToEffect(effect) {
		effect.changes.push(...effect.tokenMagicChanges);
	}
}
